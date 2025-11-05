import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiUrl } from '../config';
import { generateScalingManifestFromTemplate } from '../utils/scalingManifestTemplate';

export interface HPAConfig {
  type: 'hpa';
  minPods: number;
  maxPods: number;
  cpuThreshold: number;
  memoryThreshold: number;
}

export interface KafkaScalingConfig {
  type: 'kafka';
  minPods: number;
  maxPods: number;
  topicName: string;
  consumerGroup: string;
  bootstrapServers: string;
  lagThreshold: number;
}

export type ScalingConfig = HPAConfig | KafkaScalingConfig;

interface ScalingConfigProps {
  pipelineName: string;
  namespace: string;
  config?: ScalingConfig;
  onSave: (config: ScalingConfig) => void;
  onClose: () => void;
}

const ScalingConfig: React.FC<ScalingConfigProps> = ({
  pipelineName,
  namespace,
  config,
  onSave,
  onClose
}) => {
  const [scalingType, setScalingType] = useState<'hpa' | 'kafka'>(config?.type || 'hpa');
  const [bootstrapServerOptions, setBootstrapServerOptions] = useState<string[]>([
    'kafka-broker1:9092,kafka-broker2:9092',
    'localhost:9092',
    'kafka.staging.devops.com:9092'
  ]);
  
  // HPA State
  const [hpaConfig, setHpaConfig] = useState<HPAConfig>({
    type: 'hpa',
    minPods: config?.type === 'hpa' ? config.minPods : 1,
    maxPods: config?.type === 'hpa' ? config.maxPods : 10,
    cpuThreshold: config?.type === 'hpa' ? config.cpuThreshold : 80,
    memoryThreshold: config?.type === 'hpa' ? config.memoryThreshold : 80
  });

  // Kafka State
  const [kafkaConfig, setKafkaConfig] = useState<KafkaScalingConfig>({
    type: 'kafka',
    minPods: config?.type === 'kafka' ? config.minPods : 1,
    maxPods: config?.type === 'kafka' ? config.maxPods : 10,
    topicName: config?.type === 'kafka' ? config.topicName : '',
    consumerGroup: config?.type === 'kafka' ? config.consumerGroup : '',
    bootstrapServers: config?.type === 'kafka' ? config.bootstrapServers : '',
    lagThreshold: config?.type === 'kafka' ? config.lagThreshold : 10
  });

  // Preview State
  const [showPreview, setShowPreview] = useState(false);
  const [previewManifest, setPreviewManifest] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Fetch bootstrap server options from deployment settings
  useEffect(() => {
    const fetchBootstrapServerOptions = async () => {
      try {
        const response = await axios.get(getApiUrl('/api/pipeline-settings'));
        if (response.data.success && response.data.settings.deploymentOptions?.bootstrapServers) {
          setBootstrapServerOptions(response.data.settings.deploymentOptions.bootstrapServers);
        }
      } catch (error) {
        console.error('Error fetching bootstrap server options:', error);
      }
    };
    fetchBootstrapServerOptions();
  }, []);

  // Generate preview manifest when config changes
  useEffect(() => {
    const generatePreview = async () => {
      if (showPreview) {
        setLoadingPreview(true);
        try {
          const currentConfig = scalingType === 'hpa' ? hpaConfig : kafkaConfig;
          const manifest = await generateScalingManifestFromTemplate(
            pipelineName,
            pipelineName, // using pipelineName as serviceName
            namespace,
            currentConfig
          );
          setPreviewManifest(manifest);
        } catch (error) {
          console.error('Failed to generate preview:', error);
          setPreviewManifest('Failed to generate preview manifest');
        } finally {
          setLoadingPreview(false);
        }
      }
    };
    generatePreview();
  }, [showPreview, scalingType, hpaConfig, kafkaConfig, pipelineName, namespace]);

  const handleSave = () => {
    if (scalingType === 'hpa') {
      onSave(hpaConfig);
    } else {
      onSave(kafkaConfig);
    }
    onClose();
  };

  const isValid = () => {
    if (scalingType === 'hpa') {
      return hpaConfig.minPods > 0 && hpaConfig.maxPods > hpaConfig.minPods;
    } else {
      return kafkaConfig.minPods > 0 && 
             kafkaConfig.maxPods > kafkaConfig.minPods &&
             kafkaConfig.topicName.trim() !== '' &&
             kafkaConfig.consumerGroup.trim() !== '' &&
             kafkaConfig.bootstrapServers.trim() !== '' &&
             kafkaConfig.lagThreshold > 0;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content scaling-config-modal">
        <div className="modal-header">
          <h2>Scaling Configuration</h2>
          <button type="button" className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="scaling-config-content">
          {!showPreview ? (
            <>
          <div className="config-info">
            <p><strong>Pipeline:</strong> {pipelineName}</p>
            <p><strong>Namespace:</strong> {namespace}</p>
          </div>

          <div className="scaling-type-selector">
            <label>Scaling Type:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="hpa"
                  checked={scalingType === 'hpa'}
                  onChange={(e) => setScalingType(e.target.value as 'hpa')}
                />
                HPA (Horizontal Pod Autoscaler)
              </label>
              <label>
                <input
                  type="radio"
                  value="kafka"
                  checked={scalingType === 'kafka'}
                  onChange={(e) => setScalingType(e.target.value as 'kafka')}
                />
                Kafka-based Scaling (KEDA)
              </label>
            </div>
          </div>

          {scalingType === 'hpa' ? (
            <div className="hpa-config">
              <h3>HPA Configuration</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Min Pods:</label>
                  <input
                    type="number"
                    min="1"
                    value={hpaConfig.minPods}
                    onChange={(e) => setHpaConfig({...hpaConfig, minPods: parseInt(e.target.value) || 1})}
                  />
                </div>
                
                <div className="form-group">
                  <label>Max Pods:</label>
                  <input
                    type="number"
                    min="1"
                    value={hpaConfig.maxPods}
                    onChange={(e) => setHpaConfig({...hpaConfig, maxPods: parseInt(e.target.value) || 10})}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>CPU Threshold (%):</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={hpaConfig.cpuThreshold}
                    onChange={(e) => setHpaConfig({...hpaConfig, cpuThreshold: parseInt(e.target.value) || 80})}
                  />
                </div>
                
                <div className="form-group">
                  <label>Memory Threshold (%):</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={hpaConfig.memoryThreshold}
                    onChange={(e) => setHpaConfig({...hpaConfig, memoryThreshold: parseInt(e.target.value) || 80})}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="kafka-config">
              <h3>Kafka Scaling Configuration (KEDA)</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Min Pods:</label>
                  <input
                    type="number"
                    min="1"
                    value={kafkaConfig.minPods}
                    onChange={(e) => setKafkaConfig({...kafkaConfig, minPods: parseInt(e.target.value) || 1})}
                  />
                </div>
                
                <div className="form-group">
                  <label>Max Pods:</label>
                  <input
                    type="number"
                    min="1"
                    value={kafkaConfig.maxPods}
                    onChange={(e) => setKafkaConfig({...kafkaConfig, maxPods: parseInt(e.target.value) || 10})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Topic Name:</label>
                <input
                  type="text"
                  value={kafkaConfig.topicName}
                  onChange={(e) => setKafkaConfig({...kafkaConfig, topicName: e.target.value})}
                  placeholder="e.g., my-topic"
                />
              </div>

              <div className="form-group">
                <label>Consumer Group:</label>
                <input
                  type="text"
                  value={kafkaConfig.consumerGroup}
                  onChange={(e) => setKafkaConfig({...kafkaConfig, consumerGroup: e.target.value})}
                  placeholder="e.g., my-consumer-group"
                />
              </div>

              <div className="form-group">
                <label>Bootstrap Servers:</label>
                <input
                  type="text"
                  list="bootstrap-server-options"
                  value={kafkaConfig.bootstrapServers}
                  onChange={(e) => setKafkaConfig({...kafkaConfig, bootstrapServers: e.target.value})}
                  placeholder="Enter or select bootstrap servers"
                />
                <datalist id="bootstrap-server-options">
                  {bootstrapServerOptions.map((server, index) => (
                    <option key={index} value={server} />
                  ))}
                </datalist>
              </div>

              <div className="form-group">
                <label>Lag Threshold:</label>
                <input
                  type="number"
                  min="1"
                  value={kafkaConfig.lagThreshold}
                  onChange={(e) => setKafkaConfig({...kafkaConfig, lagThreshold: parseInt(e.target.value) || 10})}
                  placeholder="e.g., 10"
                />
                <small className="help-text">The lag threshold that triggers scaling</small>
              </div>
            </div>
          )}

          <div className="button-group">
            <button
              type="button"
              className="preview-button"
              onClick={() => setShowPreview(true)}
              disabled={!isValid()}
            >
              Preview
            </button>
            <button 
              type="button"
              className="save-button" 
              onClick={handleSave}
              disabled={!isValid()}
            >
              Save
            </button>
            <button type="button" className="cancel-button" onClick={onClose}>
              Cancel
            </button>
          </div>
            </>
          ) : (
            <div className="scaling-preview">
              <div className="preview-header">
                <h3>{scalingType === 'hpa' ? 'HPA' : 'Kafka Scaling'} Manifest Preview</h3>
                <button type="button" className="back-button" onClick={() => setShowPreview(false)}>
                  Back
                </button>
              </div>
              <pre className="manifest-preview">
                {loadingPreview ? 'Loading preview...' : previewManifest}
              </pre>
              <div className="button-group">
                <button 
                  type="button"
                  className="save-button" 
                  onClick={handleSave}
                  disabled={!isValid()}
                >
                  Save & Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScalingConfig;