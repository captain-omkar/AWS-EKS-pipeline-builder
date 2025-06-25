import { HPAConfig, KafkaScalingConfig } from '../types/Pipeline';
import axios from 'axios';
import { getApiUrl } from '../config';

export const generateHPAManifest = (
  pipelineName: string,
  serviceName: string,
  namespace: string,
  config: HPAConfig
): string => {
  const hpaManifest = `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${serviceName}-hpa
  namespace: ${namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${serviceName}
  minReplicas: ${config.minPods}
  maxReplicas: ${config.maxPods}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: ${config.cpuThreshold}
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: ${config.memoryThreshold}`;

  return hpaManifest;
};

export const generateKafkaScalingManifest = (
  pipelineName: string,
  serviceName: string,
  namespace: string,
  config: KafkaScalingConfig
): string => {
  const kafkaManifest = `apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ${serviceName}-kafka
  namespace: ${namespace}
spec:
  scaleTargetRef:
    name: ${serviceName}
  minReplicaCount: ${config.minPods}
  maxReplicaCount: ${config.maxPods}
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: ${config.bootstrapServers}
      consumerGroup: ${config.consumerGroup}
      topic: ${config.topicName}
      lagThreshold: "${config.lagThreshold}"
      offsetResetPolicy: latest`;

  return kafkaManifest;
};

export const generateHPAManifestFromTemplate = async (
  pipelineName: string,
  serviceName: string,
  namespace: string,
  config: HPAConfig
): Promise<string> => {
  try {
    // Fetch the HPA template from backend
    const response = await axios.get(getApiUrl('/api/hpa-template'));
    if (response.data.success && response.data.template) {
      // Replace template variables with actual values
      let manifest = response.data.template;
      
      manifest = manifest.replace(/\{\{\s*pipeline_name\s*\}\}/g, serviceName || pipelineName);
      manifest = manifest.replace(/\{\{\s*namespace\s*\}\}/g, namespace);
      manifest = manifest.replace(/\{\{\s*min_pods\s*\}\}/g, String(config.minPods));
      manifest = manifest.replace(/\{\{\s*max_pods\s*\}\}/g, String(config.maxPods));
      manifest = manifest.replace(/\{\{\s*cpu_threshold\s*\}\}/g, String(config.cpuThreshold));
      manifest = manifest.replace(/\{\{\s*memory_threshold\s*\}\}/g, String(config.memoryThreshold));
      
      return manifest;
    }
  } catch (error) {
    console.error('Failed to generate HPA manifest from template:', error);
  }
  
  // Fallback to original function
  return generateHPAManifest(pipelineName, serviceName, namespace, config);
};

export const generateKafkaScalingManifestFromTemplate = async (
  pipelineName: string,
  serviceName: string,
  namespace: string,
  config: KafkaScalingConfig
): Promise<string> => {
  try {
    // Fetch the Kafka template from backend
    const response = await axios.get(getApiUrl('/api/kafka-template'));
    if (response.data.success && response.data.template) {
      // Replace template variables with actual values
      let manifest = response.data.template;
      
      manifest = manifest.replace(/\{\{\s*pipeline_name\s*\}\}/g, serviceName || pipelineName);
      manifest = manifest.replace(/\{\{\s*namespace\s*\}\}/g, namespace);
      manifest = manifest.replace(/\{\{\s*min_pods\s*\}\}/g, String(config.minPods));
      manifest = manifest.replace(/\{\{\s*max_pods\s*\}\}/g, String(config.maxPods));
      manifest = manifest.replace(/\{\{\s*bootstrap_servers\s*\}\}/g, config.bootstrapServers);
      manifest = manifest.replace(/\{\{\s*consumer_group\s*\}\}/g, config.consumerGroup);
      manifest = manifest.replace(/\{\{\s*topic_name\s*\}\}/g, config.topicName);
      manifest = manifest.replace(/\{\{\s*lag_threshold\s*\}\}/g, String(config.lagThreshold));
      
      return manifest;
    }
  } catch (error) {
    console.error('Failed to generate Kafka manifest from template:', error);
  }
  
  // Fallback to original function
  return generateKafkaScalingManifest(pipelineName, serviceName, namespace, config);
};

export const generateScalingManifest = (
  pipelineName: string,
  serviceName: string,
  namespace: string,
  config: HPAConfig | KafkaScalingConfig
): string => {
  if (config.type === 'hpa') {
    return generateHPAManifest(pipelineName, serviceName, namespace, config);
  } else {
    return generateKafkaScalingManifest(pipelineName, serviceName, namespace, config);
  }
};

export const generateScalingManifestFromTemplate = async (
  pipelineName: string,
  serviceName: string,
  namespace: string,
  config: HPAConfig | KafkaScalingConfig
): Promise<string> => {
  if (config.type === 'hpa') {
    return generateHPAManifestFromTemplate(pipelineName, serviceName, namespace, config);
  } else {
    return generateKafkaScalingManifestFromTemplate(pipelineName, serviceName, namespace, config);
  }
};