import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DeploymentConfig as DeploymentConfigType, ScalingConfig } from '../types/Pipeline';
import { generateK8sManifest, generateServiceManifest, getDefaultDeploymentConfig } from '../utils/manifestTemplate';
import { generateScalingManifestFromTemplate } from '../utils/scalingManifestTemplate';
import { getApiUrl } from '../config';

interface DeploymentOptions {
  namespaces: string[];
  appTypes: string[];
  products: string[];
  nodeGroups: string[];
  serviceAccounts: string[];
  memoryOptions: string[];
  cpuOptions: string[];
  targetPortOptions?: number[];
}

interface DeploymentConfigInlineProps {
  pipelineName: string;
  ecrUri: string;
  config?: DeploymentConfigType;
  onSave: (config: DeploymentConfigType) => void;
  onClose: () => void;
  isEditMode?: boolean;  // New prop to determine if we're editing an existing pipeline
  scalingConfig?: ScalingConfig;  // Optional scaling config for preview
}

const DeploymentConfigInline: React.FC<DeploymentConfigInlineProps> = ({
  pipelineName,
  ecrUri,
  config,
  onSave,
  onClose,
  isEditMode = false,
  scalingConfig
}) => {
  const [deploymentConfig, setDeploymentConfig] = useState<DeploymentConfigType>(
    config || getDefaultDeploymentConfig()
  );
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<'deployment' | 'service' | 'scaling'>('deployment');
  const [generatedManifest, setGeneratedManifest] = useState<string>('');
  const [generatedServiceManifest, setGeneratedServiceManifest] = useState<string>('');
  const [generatedScalingManifest, setGeneratedScalingManifest] = useState<string>('');
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [existingManifest, setExistingManifest] = useState<string | null>(null);
  const [loadingExistingManifest, setLoadingExistingManifest] = useState(false);
  const [manifestExists, setManifestExists] = useState(false);
  const [deploymentOptions, setDeploymentOptions] = useState<DeploymentOptions>({
    namespaces: ['staging-devops', 'production-devops'],
    appTypes: ['csharp', 'python', 'java', 'nodejs'],
    products: ['cmo', 'modernization', 'newsverse'],
    nodeGroups: ['cmo-nodegroup', 'modernization-nodegroup', 'newsverse-nodegroup'],
    serviceAccounts: ['appmesh-comp', 'default', 'eks-service-account'],
    memoryOptions: ['100Mi', '150Mi', '200Mi', '250Mi', '300Mi', '400Mi', '500Mi', '1Gi', '2Gi'],
    cpuOptions: ['100m', '150m', '200m', '250m', '300m', '400m', '500m', '1000m', '2000m']
  });

  const handleInputChange = (field: keyof DeploymentConfigType, value: string | boolean | number) => {
    setDeploymentConfig({
      ...deploymentConfig,
      [field]: value
    });
  };

  // Fetch deployment options from settings
  useEffect(() => {
    const fetchDeploymentOptions = async () => {
      try {
        const response = await axios.get(getApiUrl('/api/pipeline-settings'));
        if (response.data.success && response.data.settings.deploymentOptions) {
          setDeploymentOptions(response.data.settings.deploymentOptions);
        }
      } catch (error) {
        console.error('Error fetching deployment options:', error);
      }
    };
    fetchDeploymentOptions();
  }, []);

  // Fetch existing manifest if in edit mode
  useEffect(() => {
    const fetchExistingManifest = async () => {
      if (isEditMode) {
        setLoadingExistingManifest(true);
        try {
          const response = await axios.get(getApiUrl(`/api/pipelines/${pipelineName}/manifest`));
          if (response.data.success) {
            if (response.data.exists) {
              setExistingManifest(response.data.content);
              setManifestExists(true);
            } else {
              // Manifest doesn't exist yet
              setManifestExists(false);
            }
          }
        } catch (error) {
          console.error('Error fetching existing manifest:', error);
          setManifestExists(false);
        } finally {
          setLoadingExistingManifest(false);
        }
      }
    };
    fetchExistingManifest();
  }, [isEditMode, pipelineName]);

  useEffect(() => {
    const loadAllManifests = async () => {
      setLoadingManifest(true);
      try {
        // Generate deployment manifest
        const manifest = await generateK8sManifest(pipelineName, ecrUri, deploymentConfig);
        setGeneratedManifest(manifest);

        // Generate service manifest
        const serviceManifest = await generateServiceManifest(pipelineName, deploymentConfig);
        setGeneratedServiceManifest(serviceManifest);

        // Generate scaling manifest if scaling config is provided
        if (scalingConfig) {
          const scalingManifest = await generateScalingManifestFromTemplate(
            pipelineName,
            deploymentConfig.serviceName || pipelineName,
            deploymentConfig.namespace,
            scalingConfig
          );
          setGeneratedScalingManifest(scalingManifest);
        } else {
          setGeneratedScalingManifest('No scaling configuration provided');
        }
      } catch (error) {
        console.error('Failed to generate manifests:', error);
        setGeneratedManifest('Failed to generate deployment manifest');
        setGeneratedServiceManifest('Failed to generate service manifest');
        setGeneratedScalingManifest('Failed to generate scaling manifest');
      } finally {
        setLoadingManifest(false);
      }
    };

    loadAllManifests();
  }, [pipelineName, ecrUri, deploymentConfig, scalingConfig]);

  const handleSave = () => {
    onSave(deploymentConfig);
    onClose();
  };

  return (
    <div className="deployment-config-inline">
      <div className="inline-header">
        <h4>Deployment Configuration</h4>
        <button type="button" className="close-inline" onClick={onClose}>&times;</button>
      </div>

      {!showPreview ? (
        <div className="inline-config-form">
          <div className="config-info-inline">
            <span><strong>Pipeline:</strong> {pipelineName}</span>
            <span><strong>Image:</strong> {ecrUri}:latest</span>
          </div>

          <div className="basic-config-section">
            <h5>Basic Configuration</h5>
            <div className="inline-form-grid" style={{gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px'}}>
              <div className="inline-field">
                <label>Service Name:</label>
                <input
                  type="text"
                  value={deploymentConfig.serviceName}
                  onChange={(e) => handleInputChange('serviceName', e.target.value)}
                  placeholder="Enter Kubernetes service name"
                  style={{width: '100%'}}
                  required
                />
              </div>
              
              <div className="inline-field">
                <label>Namespace:</label>
                <input
                  type="text"
                  list="namespace-options"
                  value={deploymentConfig.namespace}
                  onChange={(e) => handleInputChange('namespace', e.target.value)}
                  placeholder="Select namespace"
                  style={{width: '100%'}}
                />
                <datalist id="namespace-options">
                  {deploymentOptions.namespaces.map(namespace => (
                    <option key={namespace} value={namespace} />
                  ))}
                </datalist>
              </div>

              <div className="inline-field">
                <label>App Type:</label>
                <input
                  type="text"
                  list="apptype-options"
                  value={deploymentConfig.appType}
                  onChange={(e) => handleInputChange('appType', e.target.value)}
                  placeholder="Select app type"
                  style={{width: '100%'}}
                />
                <datalist id="apptype-options">
                  {deploymentOptions.appTypes.map(appType => (
                    <option key={appType} value={appType} />
                  ))}
                </datalist>
              </div>

              <div className="inline-field">
                <label>Product:</label>
                <input
                  type="text"
                  list="product-options"
                  value={deploymentConfig.product}
                  onChange={(e) => handleInputChange('product', e.target.value)}
                  placeholder="Select product"
                  style={{width: '100%'}}
                />
                <datalist id="product-options">
                  {deploymentOptions.products.map(product => (
                    <option key={product} value={product} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <div className="resources-section">
            <h5>Resources</h5>
            <div className="inline-form-grid" style={{gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px'}}>
              <div className="inline-field">
                <label>Memory Request:</label>
                <input
                  type="text"
                  list="memory-request-options"
                  value={deploymentConfig.memoryRequest}
                  onChange={(e) => handleInputChange('memoryRequest', e.target.value)}
                  placeholder="150Mi"
                  style={{width: '100%'}}
                />
                <datalist id="memory-request-options">
                  {deploymentOptions.memoryOptions.map(memory => (
                    <option key={memory} value={memory} />
                  ))}
                </datalist>
              </div>

              <div className="inline-field">
                <label>Memory Limit:</label>
                <input
                  type="text"
                  list="memory-limit-options"
                  value={deploymentConfig.memoryLimit}
                  onChange={(e) => handleInputChange('memoryLimit', e.target.value)}
                  placeholder="300Mi"
                  style={{width: '100%'}}
                />
                <datalist id="memory-limit-options">
                  {deploymentOptions.memoryOptions.map(memory => (
                    <option key={memory} value={memory} />
                  ))}
                </datalist>
              </div>

              <div className="inline-field">
                <label>CPU Request:</label>
                <input
                  type="text"
                  list="cpu-request-options"
                  value={deploymentConfig.cpuRequest}
                  onChange={(e) => handleInputChange('cpuRequest', e.target.value)}
                  placeholder="150m"
                  style={{width: '100%'}}
                />
                <datalist id="cpu-request-options">
                  {deploymentOptions.cpuOptions.map(cpu => (
                    <option key={cpu} value={cpu} />
                  ))}
                </datalist>
              </div>

              <div className="inline-field">
                <label>CPU Limit:</label>
                <input
                  type="text"
                  list="cpu-limit-options"
                  value={deploymentConfig.cpuLimit}
                  onChange={(e) => handleInputChange('cpuLimit', e.target.value)}
                  placeholder="300m"
                  style={{width: '100%'}}
                />
                <datalist id="cpu-limit-options">
                  {deploymentOptions.cpuOptions.map(cpu => (
                    <option key={cpu} value={cpu} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <div className="service-config-section">
            <h5>Service Configuration</h5>
            <div className="inline-form-grid" style={{gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
              <div className="inline-field">
                <label>Target Port:</label>
                <input
                  type="number"
                  list="targetport-options"
                  value={deploymentConfig.targetPort || 80}
                  onChange={(e) => handleInputChange('targetPort', parseInt(e.target.value) || 80)}
                  placeholder="80"
                  min="1"
                  max="65535"
                  style={{width: '100%'}}
                />
                <datalist id="targetport-options">
                  {(deploymentOptions.targetPortOptions || [80, 443, 3000, 3001, 4000, 5000, 5001, 8080, 8081, 8443, 9000, 9090]).map(port => (
                    <option key={port} value={port} />
                  ))}
                </datalist>
              </div>

              <div className="inline-field">
                <label>Service Type:</label>
                <select
                  value={deploymentConfig.serviceType || 'ClusterIP'}
                  onChange={(e) => handleInputChange('serviceType', e.target.value)}
                  style={{width: '100%', padding: '8px'}}
                >
                  <option value="ClusterIP">ClusterIP</option>
                  <option value="LoadBalancer">LoadBalancer</option>
                  <option value="NodePort">NodePort</option>
                </select>
              </div>
            </div>
          </div>

          <div className="advanced-section">
            <h5>Advanced Configuration</h5>
            <div style={{display: 'flex', gap: '40px', marginBottom: '20px'}}>
              <div style={{flex: 1}}>
                <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={deploymentConfig.useSpecificNodeGroup || false}
                    onChange={(e) => handleInputChange('useSpecificNodeGroup', e.target.checked)}
                    style={{width: '20px', height: '20px', marginRight: '10px'}}
                  />
                  <span style={{fontSize: '16px'}}>Use Specific Node Group (with taints/tolerations)</span>
                </label>
                {deploymentConfig.useSpecificNodeGroup && (
                  <div style={{marginTop: '10px', marginLeft: '30px'}}>
                    <input
                      type="text"
                      list="nodegroup-options"
                      value={deploymentConfig.nodeGroup}
                      onChange={(e) => handleInputChange('nodeGroup', e.target.value)}
                      placeholder="Select node group"
                      style={{width: '100%', padding: '8px'}}
                    />
                    <datalist id="nodegroup-options">
                      {deploymentOptions.nodeGroups.map(nodeGroup => (
                        <option key={nodeGroup} value={nodeGroup} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              <div style={{flex: 1}}>
                <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={deploymentConfig.useServiceAccount || false}
                    onChange={(e) => handleInputChange('useServiceAccount', e.target.checked)}
                    style={{width: '20px', height: '20px', marginRight: '10px'}}
                  />
                  <span style={{fontSize: '16px'}}>Use Service Account</span>
                </label>
                {deploymentConfig.useServiceAccount && (
                  <div style={{marginTop: '10px', marginLeft: '30px'}}>
                    <input
                      type="text"
                      list="serviceaccount-options"
                      value={deploymentConfig.serviceAccountName || ''}
                      onChange={(e) => handleInputChange('serviceAccountName', e.target.value)}
                      placeholder="Select service account"
                      style={{width: '100%', padding: '8px'}}
                    />
                    <datalist id="serviceaccount-options">
                      {deploymentOptions.serviceAccounts.map(sa => (
                        <option key={sa} value={sa} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="inline-buttons">
            <button type="button" className="preview-btn-inline" onClick={() => setShowPreview(true)}>
              Preview
            </button>
            <button type="button" className="save-btn-inline" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="cancel-btn-inline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="inline-preview">
          <div className="preview-header">
            <h5>Kubernetes Manifests Preview - {pipelineName}</h5>
            <button type="button" className="back-btn-inline" onClick={() => setShowPreview(false)}>
              Back
            </button>
          </div>
          
          {/* Tabs for different manifest types */}
          <div className="preview-tabs">
            <button 
              type="button"
              className={`preview-tab ${previewTab === 'deployment' ? 'active' : ''}`}
              onClick={() => setPreviewTab('deployment')}
            >
              Deployment
            </button>
            <button 
              type="button"
              className={`preview-tab ${previewTab === 'service' ? 'active' : ''}`}
              onClick={() => setPreviewTab('service')}
            >
              Service
            </button>
            {scalingConfig && (
              <button 
                type="button"
                className={`preview-tab ${previewTab === 'scaling' ? 'active' : ''}`}
                onClick={() => setPreviewTab('scaling')}
              >
                {scalingConfig.type === 'hpa' ? 'HPA' : 'Kafka Scaling'}
              </button>
            )}
          </div>
          
          {/* Tab content */}
          <div className="preview-content">
            {previewTab === 'deployment' && (
              <>
                <h6>Deployment Manifest ({pipelineName}.yml)</h6>
                {isEditMode && manifestExists ? (
                  <div className="manifest-split-view">
                    <div className="manifest-column">
                      <div className="manifest-subtitle">Existing (from AWS)</div>
                      <pre className="manifest-preview-split">
                        {loadingExistingManifest ? 'Loading existing manifest...' : (existingManifest || 'No existing manifest found')}
                      </pre>
                    </div>
                    <div className="manifest-column">
                      <div className="manifest-subtitle">Generated (from form)</div>
                      <pre className="manifest-preview-split">
                        {loadingManifest ? 'Loading manifest...' : generatedManifest}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <pre className="manifest-preview-inline">
                    {loadingManifest ? 'Loading manifest...' : generatedManifest}
                  </pre>
                )}
              </>
            )}
            
            {previewTab === 'service' && (
              <>
                <h6>Service Manifest ({pipelineName}-service.yml)</h6>
                <pre className="manifest-preview-inline">
                  {loadingManifest ? 'Loading service manifest...' : generatedServiceManifest}
                </pre>
              </>
            )}
            
            {previewTab === 'scaling' && scalingConfig && (
              <>
                <h6>{scalingConfig.type === 'hpa' ? 'HPA' : 'Kafka Scaling'} Manifest ({pipelineName}-{scalingConfig.type}.yml)</h6>
                <pre className="manifest-preview-inline">
                  {loadingManifest ? 'Loading scaling manifest...' : generatedScalingManifest}
                </pre>
              </>
            )}
          </div>
          
          <div className="inline-buttons">
            <button type="button" className="save-btn-inline" onClick={handleSave}>
              Save & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeploymentConfigInline;