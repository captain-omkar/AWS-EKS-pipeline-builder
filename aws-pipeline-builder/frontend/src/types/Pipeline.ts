export interface EnvironmentVariable {
  name: string;
  value: string;
}

export interface PipelineConfig {
  pipelineName: string;
  repositoryName: string;
  branchName: string;
  buildspecPath: string;
  computeType: string;
  environmentVariables: EnvironmentVariable[];
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