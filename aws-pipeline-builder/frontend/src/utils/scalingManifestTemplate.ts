import { HPAConfig, KafkaScalingConfig } from '../types/Pipeline';

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
      lagThreshold: "10"
      offsetResetPolicy: latest`;

  return kafkaManifest;
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