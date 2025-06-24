export interface EnvironmentVariable {
  name: string;
  value: string;
}

export interface BuildspecPhases {
  install?: {
    commands: string[];
  };
  pre_build?: {
    commands: string[];
  };
  build?: {
    commands: string[];
  };
  post_build?: {
    commands: string[];
  };
}

export interface BuildspecConfig {
  version: number;
  phases: BuildspecPhases;
}

export interface DeploymentConfig {
  namespace: string;
  appType: string;
  product: string;
  memoryLimit: string;
  cpuLimit: string;
  memoryRequest: string;
  cpuRequest: string;
  nodeGroup: string;
  useServiceAccount?: boolean;
  serviceAccountName?: string;
  targetPort?: number;
}

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
}

export type ScalingConfig = HPAConfig | KafkaScalingConfig;

export interface PipelineConfig {
  pipelineName: string;
  repositoryName: string;
  branchName: string;
  buildspecPath: string;
  useBuildspecFile: boolean;
  buildspec?: BuildspecConfig;
  computeType: string;
  environmentVariables: EnvironmentVariable[];
  appsettingsFile?: File;
  appsettingsContent?: string;
  deploymentConfig?: DeploymentConfig;
  scalingConfig?: ScalingConfig;
}

export interface DefaultValues {
  source_action_name: string;
  source_category: string;
  source_action_owner: string;
  source_provider: string;
  source_version: number;
  codestar_connection_name: string;
  build_action_name: string;
  build_category: string;
  build_owner: string;
  build_provider: string;
  build_version: number;
  codepipeline_role: string;
  build_env_image: string;
  build_env_type: string;
  build_privileged_mode: boolean;
  image_pull_credentials_type: string;
  codebuild_role: string;
  codebuild_sg: string;
}

export interface CreatePipelinesRequest {
  pipelines: (PipelineConfig & { defaults?: Partial<DefaultValues> })[];
}