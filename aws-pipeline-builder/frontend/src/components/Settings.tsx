/**
 * Settings Component
 * 
 * A modal component for managing both environment variable suggestions and pipeline configuration settings.
 * Provides tabbed interface for different configuration sections.
 * 
 * Features:
 * - Environment variable suggestions management
 * - Pipeline defaults configuration (AWS settings, IAM roles, etc.)
 * - Buildspec template editor
 * - Persist changes to backend
 * - Loading states for async operations
 * 
 * @module Settings
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as yaml from 'js-yaml';
import { getApiUrl } from '../config';

/**
 * Type definitions
 */
interface EnvSuggestions {
  [key: string]: string[];
}

interface DeploymentOptions {
  namespaces: string[];
  appTypes: string[];
  products: string[];
  nodeGroups: string[];
  serviceAccounts: string[];
  memoryOptions: string[];
  cpuOptions: string[];
  bootstrapServers: string[];
  targetPortOptions: number[];
  serviceTypeOptions?: string[];
}

interface PipelineSettings {
  aws: {
    region: string;
    accountId: string;
    ecrRegistry: string;
  };
  codebuild: {
    serviceRole: string;
    environmentType: string;
    environmentImage: string;
    privilegedMode: boolean;
    imagePullCredentialsType: string;
    securityGroup: string | null;
    vpcId: string | null;
    subnets: string[] | null;
  };
  codepipeline: {
    serviceRole: string;
    codestarConnectionName: string;
    sourceProvider: string;
    buildProvider: string;
  };
  eks: {
    clusterName: string;
    clusterRoleArn: string | null;
  };
  buildspec: any;
  deploymentOptions?: DeploymentOptions;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Settings functional component
 */
// Default buildspec template function
const getDefaultBuildspecTemplate = () => {
  return {
    version: 0.2,
    phases: {
      install: {
        commands: [
          'yum install -y jq unzip',
          'curl -O https://s3.us-west-2.amazonaws.com/amazon-eks/1.24.10/2023-01-30/bin/linux/amd64/kubectl',
          'chmod +x ./kubectl',
          'mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$PATH:$HOME/bin'
        ]
      },
      pre_build: {
        commands: [
          'echo Logging in to Amazon ECR...',
          'aws --version',
          'aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 465105616690.dkr.ecr.ap-south-1.amazonaws.com',
          'export KUBECONFIG=$HOME/.kube/config',
          'aws secretsmanager get-secret-value --secret-id $SMCREDS --query \'SecretString\' --output text > Database.json'
        ]
      },
      build: {
        commands: [
          'echo Build started on `date`',
          'IMAGE_TAG=$(echo $CODEBUILD_BUILD_ID | awk -F":" \'{print $2}\')',
          'TARGET_DIR=${REPO_DIR:-.}',
          'echo "✅ Using SERVICE_NAME=$SERVICE_NAME"',
          'echo "✅ Using TARGET_DIR=$TARGET_DIR"',
          'echo "✅ Cloning appsettings repo..."',
          'CREDENTIALS=$(aws sts assume-role --role-arn $CLUSTER_ROLE_ARN --role-session-name codebuild-kubectl --duration-seconds 900)',
          'export AWS_ACCESS_KEY_ID="$(echo ${CREDENTIALS} | jq -r \'.Credentials.AccessKeyId\')"',
          'export AWS_SECRET_ACCESS_KEY="$(echo ${CREDENTIALS} | jq -r \'.Credentials.SecretAccessKey\')"',
          'export AWS_SESSION_TOKEN="$(echo ${CREDENTIALS} | jq -r \'.Credentials.SessionToken\')"',
          'git config --global credential.helper \'!aws codecommit credential-helper $@\'',
          'git config --global credential.UseHttpPath true',
          'git clone https://git-codecommit.ap-south-1.amazonaws.com/v1/repos/$APPSETTINGS_REPO',
          'cp $APPSETTINGS_REPO/$SERVICE_NAME/appsettings.json $TARGET_DIR/',
          'ls -R $TARGET_DIR',
          'echo "✅ Replacing placeholders dynamically..."',
          '|',
          '  for key in $(jq -r \'keys[]\' Database.json); do',
          '    value=$(jq -r --arg k "$key" \'.[$k]\' Database.json)',
          '    echo "Replacing $key with $value"',
          '    sed -i "s|$key|$value|g" $TARGET_DIR/appsettings.json',
          '  done',
          'echo "✅ Final appsettings.json:"',
          'cat $TARGET_DIR/appsettings.json',
          'echo "✅ Building Docker image..."',
          'docker build -t $SERVICE_NAME -f $TARGET_DIR/Dockerfile .',
          'docker tag $SERVICE_NAME:latest $ECR_REPO_URI:$IMAGE_TAG'
        ]
      },
      post_build: {
        commands: [
          'echo Build completed on `date`',
          'echo Pushing the Docker image...',
          'docker push $ECR_REPO_URI:$IMAGE_TAG',
          'echo Writing image definitions file...',
          'echo "$Repository_Name-$Branch_Name"',
          'echo "✅ Assume role for kubectl..."',
          'git clone https://git-codecommit.ap-south-1.amazonaws.com/v1/repos/$MANIFEST_REPO',
          'cd $MANIFEST_REPO/manifests/',
          'ls',
          'aws eks update-kubeconfig --name Staging_cluster',
          'sed -i "s/latest/$IMAGE_TAG/g" $SERVICE_NAME.yml',
          'cat $SERVICE_NAME.yml',
          'kubectl apply -f $SERVICE_NAME.yml'
        ]
      }
    }
  };
};

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  // State for active tab
  const [activeTab, setActiveTab] = useState<'env' | 'pipeline' | 'buildspec' | 'manifest' | 'service' | 'hpa' | 'kafka' | 'deployment'>('env');
  
  // State for environment suggestions
  const [suggestions, setSuggestions] = useState<EnvSuggestions>({
    SECRET_CREDS: ['Database', 'cmo-secrets', 'newzverse-secrets'],
    APPSETTINGS_REPO: ['modernization-appsettings-repo'],
    MANIFEST_REPO: [],
    CLUSTER_ROLE_ARN: [],
    DOCKER_REPO_DIR: []
  });
  const [selectedEnv, setSelectedEnv] = useState<string>('SECRET_CREDS');
  const [newSuggestion, setNewSuggestion] = useState<string>('');
  
  // State for pipeline settings - initialize deploymentOptions as undefined to match the type
  const [pipelineSettings, setPipelineSettings] = useState<PipelineSettings>({
    aws: {
      region: 'ap-south-1',
      accountId: '465105616690',
      ecrRegistry: '465105616690.dkr.ecr.ap-south-1.amazonaws.com'
    },
    codebuild: {
      serviceRole: 'staging-codebuild-role',
      environmentType: 'LINUX_CONTAINER',
      environmentImage: 'aws/codebuild/amazonlinux-x86_64-standard:5.0',
      privilegedMode: true,
      imagePullCredentialsType: 'CODEBUILD',
      securityGroup: null,
      vpcId: null,
      subnets: null
    },
    codepipeline: {
      serviceRole: 'staging-codepipeline-role',
      codestarConnectionName: 'github-connections',
      sourceProvider: 'CodeStarSourceConnection',
      buildProvider: 'CodeBuild'
    },
    eks: {
      clusterName: 'Staging_cluster',
      clusterRoleArn: null
    },
    buildspec: {}
  });
  
  // State for buildspec YAML
  const [buildspecYaml, setBuildspecYaml] = useState<string>('');
  
  // State for manifest template YAML
  const [manifestYaml, setManifestYaml] = useState<string>('');
  
  // State for service template YAML
  const [serviceYaml, setServiceYaml] = useState<string>('');
  
  // State for HPA template YAML
  const [hpaYaml, setHpaYaml] = useState<string>('');
  
  // State for Kafka template YAML
  const [kafkaYaml, setKafkaYaml] = useState<string>('');
  
  // State for deployment options
  const [deploymentOptions, setDeploymentOptions] = useState<DeploymentOptions>({
    namespaces: ['staging-locobuzz', 'production-locobuzz'],
    appTypes: ['csharp', 'python', 'java', 'nodejs'],
    products: ['cmo', 'modernization', 'newsverse'],
    nodeGroups: ['cmo-nodegroup', 'modernization-nodegroup', 'newsverse-nodegroup'],
    serviceAccounts: ['appmesh-comp', 'default', 'eks-service-account'],
    memoryOptions: ['100Mi', '150Mi', '200Mi', '250Mi', '300Mi', '400Mi', '500Mi', '1Gi', '2Gi'],
    cpuOptions: ['100m', '150m', '200m', '250m', '300m', '400m', '500m', '1000m', '2000m'],
    bootstrapServers: ['kafka-broker1:9092,kafka-broker2:9092', 'localhost:9092', 'kafka.staging.locobuzz.com:9092'],
    targetPortOptions: [80, 443, 3000, 3001, 4000, 5000, 5001, 8080, 8081, 8443, 9000, 9090]
  });
  
  // Loading state
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load all data when modal opens
      const loadAllData = async () => {
        // Load these in parallel as they don't depend on each other
        await Promise.all([
          fetchSuggestions(),
          fetchPipelineSettings(),
          fetchManifestTemplate(),
          fetchServiceTemplate(),
          fetchHpaTemplate(),
          fetchKafkaTemplate()
        ]);
        
        // Load buildspec template after pipeline settings to ensure it's not overwritten
        await fetchBuildspecTemplate();
      };
      
      loadAllData();
    }
  }, [isOpen]);
  

  const fetchSuggestions = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/env-suggestions'));
      if (response.data.success) {
        setSuggestions(response.data.suggestions);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  const fetchBuildspecTemplate = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/buildspec-template'));
      if (response.data.success && response.data.buildspec) {
        // Convert buildspec to YAML for editing
        const buildspec = response.data.buildspec;
        const orderedBuildspec: any = {};
        
        // Version should come first
        if (buildspec.version !== undefined) {
          orderedBuildspec.version = buildspec.version;
        }
        
        // Then phases in the correct order
        if (buildspec.phases) {
          orderedBuildspec.phases = {};
          const phaseOrder = ['install', 'pre_build', 'build', 'post_build'];
          phaseOrder.forEach(phase => {
            if ((buildspec.phases as any)[phase]) {
              orderedBuildspec.phases[phase] = (buildspec.phases as any)[phase];
            }
          });
        }
        
        const yamlStr = yaml.dump(orderedBuildspec, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
          noCompatMode: true
        });
        setBuildspecYaml(yamlStr);
        
        // Also update pipelineSettings with the template buildspec
        setPipelineSettings(prev => ({ ...prev, buildspec: buildspec }));
      }
    } catch (error) {
      console.error('Error fetching buildspec template:', error);
    }
  };

  const fetchManifestTemplate = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/manifest-template'));
      if (response.data.success && response.data.template) {
        setManifestYaml(response.data.template);
      }
    } catch (error) {
      console.error('Error fetching manifest template:', error);
    }
  };

  const fetchServiceTemplate = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/service-template'));
      if (response.data.success && response.data.template) {
        setServiceYaml(response.data.template);
      }
    } catch (error) {
      console.error('Error fetching service template:', error);
    }
  };

  const fetchHpaTemplate = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/hpa-template'));
      if (response.data.success && response.data.template) {
        setHpaYaml(response.data.template);
      }
    } catch (error) {
      console.error('Error fetching HPA template:', error);
    }
  };

  const fetchKafkaTemplate = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/kafka-template'));
      if (response.data.success && response.data.template) {
        setKafkaYaml(response.data.template);
      }
    } catch (error) {
      console.error('Error fetching Kafka template:', error);
    }
  };

  const fetchPipelineSettings = async () => {
    try {
      const response = await axios.get(getApiUrl('/api/pipeline-settings'));
      console.log('Pipeline settings response:', response.data);
      if (response.data.success) {
        // Set the loaded settings
        const loadedSettings = response.data.settings;
        console.log('Loaded deploymentOptions:', loadedSettings.deploymentOptions);
        
        // Update pipeline settings without deploymentOptions
        const { deploymentOptions: loadedDeploymentOptions, ...settingsWithoutDeployment } = loadedSettings;
        
        // Ensure all required properties exist with defaults
        setPipelineSettings({
          aws: settingsWithoutDeployment.aws || {
            region: 'us-east-1',
            accountId: '',
            ecrRegistry: ''
          },
          codebuild: settingsWithoutDeployment.codebuild || {
            serviceRole: '',
            environmentType: 'LINUX_CONTAINER',
            environmentImage: 'aws/codebuild/amazonlinux-x86_64-standard:5.0',
            privilegedMode: true,
            imagePullCredentialsType: 'CODEBUILD',
            securityGroup: null,
            vpcId: null,
            subnets: null
          },
          codepipeline: settingsWithoutDeployment.codepipeline || {
            serviceRole: '',
            codestarConnectionName: '',
            sourceProvider: 'CodeStarSourceConnection',
            buildProvider: 'CodeBuild'
          },
          eks: settingsWithoutDeployment.eks || {
            clusterName: '',
            clusterRoleArn: null
          },
          buildspec: settingsWithoutDeployment.buildspec || {} // Preserve existing buildspec if available
        });
        
        // Update deployment options separately if they exist
        if (loadedDeploymentOptions) {
          setDeploymentOptions(loadedDeploymentOptions);
        }
      }
    } catch (error) {
      console.error('Error fetching pipeline settings:', error);
    }
  };

  const addSuggestion = async () => {
    if (!newSuggestion.trim()) return;

    const updatedSuggestions = {
      ...suggestions,
      [selectedEnv]: [...(suggestions[selectedEnv] || []), newSuggestion.trim()]
    };

    try {
      setLoading(true);
      const response = await axios.post(getApiUrl('/api/env-suggestions'), {
        suggestions: updatedSuggestions
      });
      
      if (response.data.success) {
        setSuggestions(updatedSuggestions);
        setNewSuggestion('');
      }
    } catch (error) {
      console.error('Error saving suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeSuggestion = async (env: string, index: number) => {
    const updatedSuggestions = {
      ...suggestions,
      [env]: suggestions[env].filter((_, i) => i !== index)
    };

    try {
      setLoading(true);
      const response = await axios.post(getApiUrl('/api/env-suggestions'), {
        suggestions: updatedSuggestions
      });
      
      if (response.data.success) {
        setSuggestions(updatedSuggestions);
      }
    } catch (error) {
      console.error('Error saving suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePipelineSettings = async () => {
    try {
      setLoading(true);
      
      // Save buildspec template to DynamoDB if it was edited
      if (activeTab === 'buildspec' && buildspecYaml) {
        try {
          // Parse and validate the buildspec YAML
          const buildspecObj = yaml.load(buildspecYaml) as any;
          
          // Ensure phases are in correct order when saving
          if (buildspecObj.phases) {
            const orderedPhases: any = {};
            const phaseOrder = ['install', 'pre_build', 'build', 'post_build'];
            phaseOrder.forEach(phase => {
              if (buildspecObj.phases[phase]) {
                orderedPhases[phase] = buildspecObj.phases[phase];
              }
            });
            buildspecObj.phases = orderedPhases;
          }
          
          // Save buildspec template to DynamoDB
          const buildspecResponse = await axios.post(getApiUrl('/api/buildspec-template'), {
            buildspec: buildspecObj
          });
          
          if (!buildspecResponse.data.success) {
            alert('Failed to save buildspec template');
            return;
          }
          
          // Update the local state so the change is reflected immediately
          setPipelineSettings(prev => ({ ...prev, buildspec: buildspecObj }));
        } catch (e: any) {
          alert(`Invalid YAML format for buildspec: ${e.message}`);
          return;
        }
      }
      
      // Save manifest template to DynamoDB if it was edited
      if (activeTab === 'manifest' && manifestYaml) {
        try {
          // Note: We don't validate manifest template as YAML because it contains 
          // template placeholders like {{ variable }} which are not valid YAML
          
          // Save manifest template to DynamoDB
          const manifestResponse = await axios.post(getApiUrl('/api/manifest-template'), {
            template: manifestYaml
          });
          
          if (!manifestResponse.data.success) {
            alert('Failed to save manifest template');
            return;
          }
        } catch (e: any) {
          alert(`Failed to save manifest template: ${e.message}`);
          return;
        }
      }
      
      // Save service template to DynamoDB if it was edited
      if (activeTab === 'service' && serviceYaml) {
        try {
          // Note: We don't validate service template as YAML because it contains 
          // template placeholders like {{ variable }} which are not valid YAML
          
          // Save service template to DynamoDB
          const serviceResponse = await axios.post(getApiUrl('/api/service-template'), {
            template: serviceYaml
          });
          
          if (!serviceResponse.data.success) {
            alert('Failed to save service template');
            return;
          }
        } catch (e: any) {
          alert(`Failed to save service template: ${e.message}`);
          return;
        }
      }
      
      // Save HPA template to DynamoDB if it was edited
      if (activeTab === 'hpa' && hpaYaml) {
        try {
          // Note: We don't validate HPA template as YAML because it contains 
          // template placeholders like {{ variable }} which are not valid YAML
          
          // Save HPA template to DynamoDB
          const hpaResponse = await axios.post(getApiUrl('/api/hpa-template'), {
            template: hpaYaml
          });
          
          if (!hpaResponse.data.success) {
            alert('Failed to save HPA template');
            return;
          }
        } catch (e: any) {
          alert(`Failed to save HPA template: ${e.message}`);
          return;
        }
      }
      
      // Save Kafka template to DynamoDB if it was edited
      if (activeTab === 'kafka' && kafkaYaml) {
        try {
          // Note: We don't validate Kafka template as YAML because it contains 
          // template placeholders like {{ variable }} which are not valid YAML
          
          // Save Kafka template to DynamoDB
          const kafkaResponse = await axios.post(getApiUrl('/api/kafka-template'), {
            template: kafkaYaml
          });
          
          if (!kafkaResponse.data.success) {
            alert('Failed to save Kafka template');
            return;
          }
        } catch (e: any) {
          alert(`Failed to save Kafka template: ${e.message}`);
          return;
        }
      }
      
      // Include deployment options in the settings
      const settingsToSave = {
        ...pipelineSettings,
        deploymentOptions: deploymentOptions
      };
      
      console.log('Saving settings with deploymentOptions:', settingsToSave.deploymentOptions);
      const response = await axios.post(getApiUrl('/api/pipeline-settings'), {
        settings: settingsToSave
      });
      
      if (response.data.success) {
        alert('Pipeline settings saved successfully!');
        // Reload to ensure everything is in sync
        await fetchPipelineSettings();
      }
    } catch (error) {
      console.error('Error saving pipeline settings:', error);
      alert('Failed to save pipeline settings');
    } finally {
      setLoading(false);
    }
  };

  const updatePipelineSetting = (section: keyof PipelineSettings, key: string, value: any) => {
    setPipelineSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-modal" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-tabs">
          <button 
            className={`tab ${activeTab === 'env' ? 'active' : ''}`}
            onClick={() => setActiveTab('env')}
          >
            Environment Variables
          </button>
          <button 
            className={`tab ${activeTab === 'pipeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            Pipeline Defaults
          </button>
          <button 
            className={`tab ${activeTab === 'buildspec' ? 'active' : ''}`}
            onClick={() => setActiveTab('buildspec')}
          >
            Buildspec Template
          </button>
          <button 
            className={`tab ${activeTab === 'manifest' ? 'active' : ''}`}
            onClick={() => setActiveTab('manifest')}
          >
            Manifest Template
          </button>
          <button 
            className={`tab ${activeTab === 'service' ? 'active' : ''}`}
            onClick={() => setActiveTab('service')}
          >
            Service Template
          </button>
          <button 
            className={`tab ${activeTab === 'hpa' ? 'active' : ''}`}
            onClick={() => setActiveTab('hpa')}
          >
            HPA Template
          </button>
          <button 
            className={`tab ${activeTab === 'kafka' ? 'active' : ''}`}
            onClick={() => setActiveTab('kafka')}
          >
            Kafka Template
          </button>
          <button 
            className={`tab ${activeTab === 'deployment' ? 'active' : ''}`}
            onClick={() => setActiveTab('deployment')}
          >
            Deployment Options
          </button>
        </div>
        
        <div className="settings-content">
          {activeTab === 'env' && (
            <>
              <div className="env-selector">
                <label>Select Environment Variable:</label>
                <select 
                  value={selectedEnv} 
                  onChange={(e) => setSelectedEnv(e.target.value)}
                  className="env-select"
                >
                  {Object.keys(suggestions).map(env => (
                    <option key={env} value={env}>{env}</option>
                  ))}
                </select>
              </div>

              <div className="suggestions-section">
                <h3>Current Suggestions for {selectedEnv}:</h3>
                <div className="suggestions-list">
                  {(suggestions[selectedEnv] || []).length === 0 ? (
                    <p className="no-suggestions">No suggestions yet</p>
                  ) : (
                    suggestions[selectedEnv].map((suggestion, index) => (
                      <div key={index} className="suggestion-item">
                        <span>{suggestion}</span>
                        <button 
                          onClick={() => removeSuggestion(selectedEnv, index)}
                          className="remove-btn"
                          disabled={loading}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="add-suggestion">
                <input
                  type="text"
                  value={newSuggestion}
                  onChange={(e) => setNewSuggestion(e.target.value)}
                  placeholder={`Add new suggestion for ${selectedEnv}`}
                  onKeyPress={(e) => e.key === 'Enter' && addSuggestion()}
                />
                <button 
                  onClick={addSuggestion} 
                  disabled={loading || !newSuggestion.trim()}
                  className="add-btn"
                >
                  Add Suggestion
                </button>
              </div>
            </>
          )}
          
          {activeTab === 'pipeline' && (
            <div className="pipeline-settings">
              <div className="settings-section">
                <h3>AWS Configuration</h3>
                <div className="form-group">
                  <label>Region:</label>
                  <input
                    type="text"
                    value={pipelineSettings.aws?.region || ''}
                    onChange={(e) => updatePipelineSetting('aws', 'region', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Account ID:</label>
                  <input
                    type="text"
                    value={pipelineSettings.aws?.accountId || ''}
                    onChange={(e) => updatePipelineSetting('aws', 'accountId', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>ECR Registry:</label>
                  <input
                    type="text"
                    value={pipelineSettings.aws?.ecrRegistry || ''}
                    onChange={(e) => updatePipelineSetting('aws', 'ecrRegistry', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="settings-section">
                <h3>CodeBuild Configuration</h3>
                <div className="form-group">
                  <label>Service Role:</label>
                  <input
                    type="text"
                    value={pipelineSettings.codebuild?.serviceRole || ''}
                    onChange={(e) => updatePipelineSetting('codebuild', 'serviceRole', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Environment Type:</label>
                  <input
                    type="text"
                    value={pipelineSettings.codebuild?.environmentType || ''}
                    onChange={(e) => updatePipelineSetting('codebuild', 'environmentType', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Environment Image:</label>
                  <input
                    type="text"
                    value={pipelineSettings.codebuild?.environmentImage || ''}
                    onChange={(e) => updatePipelineSetting('codebuild', 'environmentImage', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>VPC ID (optional):</label>
                  <input
                    type="text"
                    value={pipelineSettings.codebuild?.vpcId || ''}
                    onChange={(e) => updatePipelineSetting('codebuild', 'vpcId', e.target.value || null)}
                    placeholder="vpc-xxxxxxxxx"
                  />
                </div>
                <div className="form-group">
                  <label>Subnets (optional):</label>
                  <div style={{ marginTop: '10px' }}>
                    {(pipelineSettings.codebuild?.subnets || []).map((subnet, index) => (
                      <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <input
                          type="text"
                          value={subnet}
                          onChange={(e) => {
                            const newSubnets = [...(pipelineSettings.codebuild?.subnets || [])];
                            newSubnets[index] = e.target.value;
                            updatePipelineSetting('codebuild', 'subnets', newSubnets.filter(s => s));
                          }}
                          placeholder="subnet-xxxxx"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newSubnets = (pipelineSettings.codebuild?.subnets || []).filter((_, i) => i !== index);
                            updatePipelineSetting('codebuild', 'subnets', newSubnets.length > 0 ? newSubnets : null);
                          }}
                          style={{ 
                            backgroundColor: '#d32f2f',
                            color: 'white',
                            border: 'none',
                            padding: '8px 15px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const currentSubnets = pipelineSettings.codebuild?.subnets || [];
                        updatePipelineSetting('codebuild', 'subnets', [...currentSubnets, '']);
                      }}
                      style={{ 
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        padding: '8px 15px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginTop: '5px'
                      }}
                    >
                      Add Subnet
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Security Group (optional):</label>
                  <input
                    type="text"
                    value={pipelineSettings.codebuild?.securityGroup || ''}
                    onChange={(e) => updatePipelineSetting('codebuild', 'securityGroup', e.target.value || null)}
                    placeholder="sg-xxxxxxxxx"
                  />
                </div>
              </div>
              
              <div className="settings-section">
                <h3>CodePipeline Configuration</h3>
                <div className="form-group">
                  <label>Service Role:</label>
                  <input
                    type="text"
                    value={pipelineSettings.codepipeline?.serviceRole || ''}
                    onChange={(e) => updatePipelineSetting('codepipeline', 'serviceRole', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>CodeStar Connection Name:</label>
                  <input
                    type="text"
                    value={pipelineSettings.codepipeline?.codestarConnectionName || ''}
                    onChange={(e) => updatePipelineSetting('codepipeline', 'codestarConnectionName', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="settings-section">
                <h3>EKS Configuration</h3>
                <div className="form-group">
                  <label>Cluster Name:</label>
                  <input
                    type="text"
                    value={pipelineSettings.eks?.clusterName || ''}
                    onChange={(e) => updatePipelineSetting('eks', 'clusterName', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Cluster Role ARN (optional):</label>
                  <input
                    type="text"
                    value={pipelineSettings.eks?.clusterRoleArn || ''}
                    onChange={(e) => updatePipelineSetting('eks', 'clusterRoleArn', e.target.value || null)}
                    placeholder="arn:aws:iam::accountId:role/role-name"
                  />
                </div>
              </div>
              
              <button 
                onClick={savePipelineSettings} 
                disabled={loading}
                className="save-btn"
              >
                Save Pipeline Settings
              </button>
            </div>
          )}
          
          {activeTab === 'buildspec' && (
            <div className="buildspec-editor">
              <h3>Buildspec Template (YAML format)</h3>
              <p className="help-text">
                Edit the default buildspec template that will be used when creating new pipelines.
                This should be in YAML format, which is the native format for AWS CodeBuild buildspec files.
              </p>
              <textarea
                value={buildspecYaml}
                onChange={(e) => setBuildspecYaml(e.target.value)}
                placeholder="Enter buildspec template in YAML format...

Example:
version: 0.2
phases:
  install:
    commands:
      - echo Installing dependencies...
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
  build:
    commands:
      - echo Build started...
  post_build:
    commands:
      - echo Build completed..."
                rows={25}
                style={{ 
                  width: '100%', 
                  fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
                  fontSize: '13px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#f8f9fa',
                  lineHeight: '1.5'
                }}
              />
              <button 
                onClick={savePipelineSettings} 
                disabled={loading}
                className="save-btn"
              >
                Save Buildspec Template
              </button>
            </div>
          )}
          
          {activeTab === 'manifest' && (
            <div className="manifest-editor">
              <h3>Kubernetes Manifest Template</h3>
              <p className="help-text">
                Edit the master Kubernetes manifest template that will be used when creating deployments for all pipelines.
                This template supports variable substitution for dynamic values.
              </p>
              <textarea
                value={manifestYaml}
                onChange={(e) => setManifestYaml(e.target.value)}
                placeholder="Enter Kubernetes manifest template...

Example:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ pipeline_name }}
  namespace: {{ namespace }}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: {{ pipeline_name }}
  template:
    metadata:
      labels:
        app: {{ pipeline_name }}
    spec:
      containers:
      - name: {{ pipeline_name }}
        image: {{ image }}
        resources:
          limits:
            memory: {{ memory_limit }}
            cpu: {{ cpu_limit }}
          requests:
            memory: {{ memory_request }}
            cpu: {{ cpu_request }}"
                rows={25}
                style={{ 
                  width: '100%', 
                  fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
                  fontSize: '13px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#f8f9fa',
                  lineHeight: '1.5'
                }}
              />
              <button 
                onClick={savePipelineSettings} 
                disabled={loading}
                className="save-btn"
              >
                Save Manifest Template
              </button>
            </div>
          )}
          
          {activeTab === 'service' && (
            <div className="service-editor">
              <h3>Kubernetes Service Template</h3>
              <p className="help-text">
                Edit the master Kubernetes Service template that will be used when creating services for all pipelines.
                This template supports variable substitution for dynamic values.
              </p>
              <textarea
                value={serviceYaml}
                onChange={(e) => setServiceYaml(e.target.value)}
                placeholder={`Enter Kubernetes Service template...

Example:
apiVersion: v1
kind: Service
metadata:
  name: {{ pipeline_name }}
  namespace: {{ namespace }}
spec:
  selector:
    app.kubernetes.io/name: {{ pipeline_name }}
  ports:
    - protocol: TCP
      port: 80
      targetPort: {{ target_port }}
  type: {{ service_type }}`}
                rows={25}
                style={{ 
                  width: '100%', 
                  fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
                  fontSize: '13px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#f8f9fa',
                  lineHeight: '1.5'
                }}
              />
              <button 
                onClick={savePipelineSettings} 
                disabled={loading}
                className="save-btn"
              >
                Save Service Template
              </button>
            </div>
          )}
          
          {activeTab === 'hpa' && (
            <div className="hpa-editor">
              <h3>HPA (Horizontal Pod Autoscaler) Template</h3>
              <p className="help-text">
                Edit the master HPA template that will be used when creating HPA scaling for all pipelines.
                This template supports variable substitution for dynamic values.
              </p>
              <textarea
                value={hpaYaml}
                onChange={(e) => setHpaYaml(e.target.value)}
                placeholder={`Enter HPA template...

Example:
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ pipeline_name }}-hpa
  namespace: {{ namespace }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ pipeline_name }}
  minReplicas: {{ min_pods }}
  maxReplicas: {{ max_pods }}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: {{ cpu_threshold }}
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: {{ memory_threshold }}`}
                rows={25}
                style={{ 
                  width: '100%', 
                  fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
                  fontSize: '13px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#f8f9fa',
                  lineHeight: '1.5'
                }}
              />
              <button 
                onClick={savePipelineSettings} 
                disabled={loading}
                className="save-btn"
              >
                Save HPA Template
              </button>
            </div>
          )}
          
          {activeTab === 'kafka' && (
            <div className="kafka-editor">
              <h3>Kafka KEDA ScaledObject Template</h3>
              <p className="help-text">
                Edit the master Kafka KEDA ScaledObject template that will be used when creating Kafka-based scaling for all pipelines.
                This template supports variable substitution for dynamic values.
              </p>
              <textarea
                value={kafkaYaml}
                onChange={(e) => setKafkaYaml(e.target.value)}
                placeholder={`Enter Kafka KEDA template...

Example:
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: {{ pipeline_name }}-kafka
  namespace: {{ namespace }}
spec:
  scaleTargetRef:
    name: {{ pipeline_name }}
  minReplicaCount: {{ min_pods }}
  maxReplicaCount: {{ max_pods }}
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: {{ bootstrap_servers }}
      consumerGroup: {{ consumer_group }}
      topic: {{ topic_name }}
      lagThreshold: "10"
      offsetResetPolicy: latest`}
                rows={25}
                style={{ 
                  width: '100%', 
                  fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
                  fontSize: '13px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#f8f9fa',
                  lineHeight: '1.5'
                }}
              />
              <button 
                onClick={savePipelineSettings} 
                disabled={loading}
                className="save-btn"
              >
                Save Kafka Template
              </button>
            </div>
          )}
          
          {activeTab === 'deployment' && (
            <div className="deployment-options">
              <h3>Deployment Configuration Options</h3>
              <p className="help-text">
                Manage the dropdown options available for deployment configurations.
              </p>
              
              <div className="deployment-option-section">
                <h4>Namespaces</h4>
                <div className="option-list">
                  {deploymentOptions.namespaces.map((namespace, index) => (
                    <div key={index} className="option-item">
                      <span>{namespace}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.namespaces];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, namespaces: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="namespace-input"
                      placeholder="Add namespace"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.namespaces, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, namespaces: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('namespace-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.namespaces, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, namespaces: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="deployment-option-section">
                <h4>App Types</h4>
                <div className="option-list">
                  {deploymentOptions.appTypes.map((appType, index) => (
                    <div key={index} className="option-item">
                      <span>{appType}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.appTypes];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, appTypes: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="apptype-input"
                      placeholder="Add app type"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.appTypes, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, appTypes: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('apptype-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.appTypes, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, appTypes: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="deployment-option-section">
                <h4>Products</h4>
                <div className="option-list">
                  {deploymentOptions.products.map((product, index) => (
                    <div key={index} className="option-item">
                      <span>{product}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.products];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, products: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="product-input"
                      placeholder="Add product"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.products, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, products: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('product-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.products, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, products: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="deployment-option-section">
                <h4>Node Groups</h4>
                <div className="option-list">
                  {deploymentOptions.nodeGroups.map((nodeGroup, index) => (
                    <div key={index} className="option-item">
                      <span>{nodeGroup}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.nodeGroups];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, nodeGroups: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="nodegroup-input"
                      placeholder="Add node group"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.nodeGroups, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, nodeGroups: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('nodegroup-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.nodeGroups, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, nodeGroups: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="deployment-option-section">
                <h4>Service Accounts</h4>
                <div className="option-list">
                  {deploymentOptions.serviceAccounts.map((serviceAccount, index) => (
                    <div key={index} className="option-item">
                      <span>{serviceAccount}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.serviceAccounts];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, serviceAccounts: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="serviceaccount-input"
                      placeholder="Add service account"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.serviceAccounts, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, serviceAccounts: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('serviceaccount-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.serviceAccounts, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, serviceAccounts: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="deployment-option-section">
                <h4>Memory Options</h4>
                <div className="option-list">
                  {deploymentOptions.memoryOptions.map((memory, index) => (
                    <div key={index} className="option-item">
                      <span>{memory}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.memoryOptions];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, memoryOptions: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="memory-input"
                      placeholder="Add memory option (e.g., 512Mi)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.memoryOptions, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, memoryOptions: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('memory-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.memoryOptions, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, memoryOptions: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="deployment-option-section">
                <h4>CPU Options</h4>
                <div className="option-list">
                  {deploymentOptions.cpuOptions.map((cpu, index) => (
                    <div key={index} className="option-item">
                      <span>{cpu}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.cpuOptions];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, cpuOptions: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="cpu-input"
                      placeholder="Add CPU option (e.g., 600m)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.cpuOptions, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, cpuOptions: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('cpu-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.cpuOptions, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, cpuOptions: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="deployment-option-section">
                <h4>Bootstrap Servers (Kafka/KEDA)</h4>
                <div className="option-list">
                  {deploymentOptions.bootstrapServers.map((server, index) => (
                    <div key={index} className="option-item">
                      <span>{server}</span>
                      <button
                        onClick={() => {
                          const updated = [...deploymentOptions.bootstrapServers];
                          updated.splice(index, 1);
                          setDeploymentOptions(prev => ({ ...prev, bootstrapServers: updated }));
                        }}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-option">
                    <input
                      type="text"
                      id="bootstrap-input"
                      placeholder="Add bootstrap server (e.g., kafka-broker:9092)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value.trim()) {
                            const updated = [...deploymentOptions.bootstrapServers, input.value.trim()];
                            setDeploymentOptions(prev => ({ ...prev, bootstrapServers: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('bootstrap-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const updated = [...deploymentOptions.bootstrapServers, input.value.trim()];
                          setDeploymentOptions(prev => ({ ...prev, bootstrapServers: updated }));
                          input.value = '';
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Target Port Options */}
              <div className="env-section">
                <h4>Target Port Options</h4>
                <div className="env-list">
                  {deploymentOptions.targetPortOptions.map((port, index) => (
                    <div key={index} className="env-item">
                      <span>{port}</span>
                      <button
                        onClick={() => {
                          const updated = deploymentOptions.targetPortOptions.filter((_, i) => i !== index);
                          setDeploymentOptions(prev => ({ ...prev, targetPortOptions: updated }));
                        }}
                        className="remove-btn"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="env-input-group">
                    <input
                      type="number"
                      id="targetport-input"
                      placeholder="Add target port (e.g., 8080)"
                      min="1"
                      max="65535"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          const value = parseInt(input.value.trim());
                          if (value && value > 0 && value <= 65535 && !deploymentOptions.targetPortOptions.includes(value)) {
                            const updated = [...deploymentOptions.targetPortOptions, value].sort((a, b) => a - b);
                            setDeploymentOptions(prev => ({ ...prev, targetPortOptions: updated }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('targetport-input') as HTMLInputElement;
                        if (input) {
                          const value = parseInt(input.value.trim());
                          if (value && value > 0 && value <= 65535 && !deploymentOptions.targetPortOptions.includes(value)) {
                            const updated = [...deploymentOptions.targetPortOptions, value].sort((a, b) => a - b);
                            setDeploymentOptions(prev => ({ ...prev, targetPortOptions: updated }));
                            input.value = '';
                          }
                        }
                      }}
                      className="add-btn"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={savePipelineSettings} 
                disabled={loading}
                className="save-btn"
              >
                Save Deployment Options
              </button>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default Settings;