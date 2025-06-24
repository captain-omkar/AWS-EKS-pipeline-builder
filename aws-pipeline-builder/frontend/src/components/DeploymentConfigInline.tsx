import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DeploymentConfig as DeploymentConfigType } from '../types/Pipeline';
import { generateK8sManifest, getDefaultDeploymentConfig } from '../utils/manifestTemplate';
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
}

const DeploymentConfigInline: React.FC<DeploymentConfigInlineProps> = ({
  pipelineName,
  ecrUri,
  config,
  onSave,
  onClose
}) => {
  const [deploymentConfig, setDeploymentConfig] = useState<DeploymentConfigType>(
    config || getDefaultDeploymentConfig()
  );
  const [showPreview, setShowPreview] = useState(false);
  const [generatedManifest, setGeneratedManifest] = useState<string>('');
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [deploymentOptions, setDeploymentOptions] = useState<DeploymentOptions>({
    namespaces: ['staging-locobuzz', 'production-locobuzz'],
    appTypes: ['csharp', 'python', 'java', 'nodejs'],
    products: ['cmo', 'modernization', 'newsverse'],
    nodeGroups: ['cmo-nodegroup', 'modernization-nodegroup', 'newsverse-nodegroup'],
    serviceAccounts: ['appmesh-comp', 'default', 'eks-service-account'],
    memoryOptions: ['100Mi', '150Mi', '200Mi', '250Mi', '300Mi', '400Mi', '500Mi', '1Gi', '2Gi'],
    cpuOptions: ['100m', '150m', '200m', '250m', '300m', '400m', '500m', '1000m', '2000m']
  });

  const handleInputChange = (field: keyof DeploymentConfigType, value: string | boolean) => {
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

  useEffect(() => {
    const loadManifest = async () => {
      setLoadingManifest(true);
      try {
        const manifest = await generateK8sManifest(pipelineName, ecrUri, deploymentConfig);
        setGeneratedManifest(manifest);
      } catch (error) {
        console.error('Failed to generate manifest:', error);
        setGeneratedManifest('Failed to generate manifest');
      } finally {
        setLoadingManifest(false);
      }
    };

    loadManifest();
  }, [pipelineName, ecrUri, deploymentConfig]);

  const handleSave = () => {
    onSave(deploymentConfig);
    onClose();
  };

  return (
    <div className="deployment-config-inline">
      <div className="inline-header">
        <h4>Deployment Configuration</h4>
        <button className="close-inline" onClick={onClose}>&times;</button>
      </div>

      {!showPreview ? (
        <div className="inline-config-form">
          <div className="config-info-inline">
            <span><strong>Pipeline:</strong> {pipelineName}</span>
            <span><strong>Image:</strong> {ecrUri}:latest</span>
          </div>

          <div className="inline-form-grid">
            <div className="inline-field">
              <label>Namespace:</label>
              <input
                type="text"
                list="namespace-options"
                value={deploymentConfig.namespace}
                onChange={(e) => handleInputChange('namespace', e.target.value)}
                placeholder="Enter or select namespace"
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
                placeholder="Enter or select app type"
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
                placeholder="Enter or select product"
              />
              <datalist id="product-options">
                {deploymentOptions.products.map(product => (
                  <option key={product} value={product} />
                ))}
              </datalist>
            </div>

            <div className="inline-field">
              <label>Node Group:</label>
              <input
                type="text"
                list="nodegroup-options"
                value={deploymentConfig.nodeGroup}
                onChange={(e) => handleInputChange('nodeGroup', e.target.value)}
                placeholder="Enter or select node group"
              />
              <datalist id="nodegroup-options">
                {deploymentOptions.nodeGroups.map(nodeGroup => (
                  <option key={nodeGroup} value={nodeGroup} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="resources-section">
            <h5>Resources</h5>
            <div className="inline-form-grid">
              <div className="inline-field">
                <label>Memory Request:</label>
                <input
                  type="text"
                  list="memory-request-options"
                  value={deploymentConfig.memoryRequest}
                  onChange={(e) => handleInputChange('memoryRequest', e.target.value)}
                  placeholder="e.g., 150Mi"
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
                  placeholder="e.g., 300Mi"
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
                  placeholder="e.g., 150m"
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
                  placeholder="e.g., 300m"
                />
                <datalist id="cpu-limit-options">
                  {deploymentOptions.cpuOptions.map(cpu => (
                    <option key={cpu} value={cpu} />
                  ))}
                </datalist>
              </div>

              <div className="inline-field">
                <label>Target Port:</label>
                <input
                  type="number"
                  list="targetport-options"
                  value={deploymentConfig.targetPort || 80}
                  onChange={(e) => handleInputChange('targetPort', parseInt(e.target.value) || 80)}
                  placeholder="e.g., 80"
                  min="1"
                  max="65535"
                />
                <datalist id="targetport-options">
                  {(deploymentOptions.targetPortOptions || [80, 443, 3000, 3001, 4000, 5000, 5001, 8080, 8081, 8443, 9000, 9090]).map(port => (
                    <option key={port} value={port} />
                  ))}
                </datalist>
                <small style={{color: '#666', marginLeft: '5px'}}>Container port for the application</small>
              </div>
            </div>
          </div>

          <div className="service-account-section">
            <h5>Service Account</h5>
            <div className="inline-form-grid">
              <div className="inline-field">
                <label>
                  <input
                    type="checkbox"
                    checked={deploymentConfig.useServiceAccount || false}
                    onChange={(e) => handleInputChange('useServiceAccount', e.target.checked)}
                  />
                  Use Service Account
                </label>
              </div>
              {deploymentConfig.useServiceAccount && (
                <div className="inline-field">
                  <label>Service Account Name:</label>
                  <input
                    type="text"
                    list="serviceaccount-options"
                    value={deploymentConfig.serviceAccountName || ''}
                    onChange={(e) => handleInputChange('serviceAccountName', e.target.value)}
                    placeholder="Enter or select service account"
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

          <div className="inline-buttons">
            <button className="preview-btn-inline" onClick={() => setShowPreview(true)}>
              Preview
            </button>
            <button className="save-btn-inline" onClick={handleSave}>
              Save
            </button>
            <button className="cancel-btn-inline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="inline-preview">
          <div className="preview-header">
            <h5>Manifest Preview - {pipelineName}.yml</h5>
            <button className="back-btn-inline" onClick={() => setShowPreview(false)}>
              Back
            </button>
          </div>
          <pre className="manifest-preview-inline">
            {loadingManifest ? 'Loading manifest...' : generatedManifest}
          </pre>
          <div className="inline-buttons">
            <button className="save-btn-inline" onClick={handleSave}>
              Save & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeploymentConfigInline;