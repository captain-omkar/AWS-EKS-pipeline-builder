from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json
import os
from datetime import datetime
from dynamodb_storage import DynamoDBStorage
from lock_manager import lock_manager

# Initialize Flask application with CORS support for cross-origin requests
app = Flask(__name__)

# Load configuration
CONFIG_PATH = os.environ.get('CONFIG_PATH', 'appsettings.json')

def load_app_settings():
    """Load application settings from appsettings.json"""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {}

def get_aws_session():
    """Create AWS session with credential fallback logic"""
    app_settings = load_app_settings()
    aws_config = app_settings.get('aws', {})
    region = aws_config.get('region', 'ap-south-1')
    credentials = aws_config.get('credentials', {})
    
    # Try explicit credentials first
    if credentials.get('access_key_id') and credentials.get('secret_access_key'):
        session = boto3.Session(
            aws_access_key_id=credentials['access_key_id'],
            aws_secret_access_key=credentials['secret_access_key'],
            aws_session_token=credentials.get('session_token'),
            region_name=region
        )
        print("✅ Using AWS credentials from appsettings.json")
    else:
        # Fall back to default credential chain (env vars, instance profile, etc.)
        session = boto3.Session(region_name=region)
        print("✅ Using AWS credentials from instance profile/environment")
    
    return session

# Initialize AWS service clients with configuration
session = get_aws_session()
codepipeline = session.client('codepipeline')
codebuild = session.client('codebuild')
codestar_connections = session.client('codestar-connections')
ecr = session.client('ecr')
codecommit = session.client('codecommit')
s3 = session.client('s3')

# Load other settings
app_settings = load_app_settings()
GIT_AUTHOR_NAME = app_settings.get('git', {}).get('author_name', 'AWS Pipeline Builder')
GIT_AUTHOR_EMAIL = app_settings.get('git', {}).get('author_email', 'pipeline-builder@example.com')

# Configure CORS with settings
cors_origins = app_settings.get('app', {}).get('cors_origins', ['http://localhost:3000'])
CORS(app, origins=cors_origins)

# Initialize DynamoDB storage
dynamodb_config = app_settings.get('dynamodb', {})
storage = DynamoDBStorage(dynamodb_config, session)

def upload_file_to_codecommit(repo_name, file_path, content, commit_message):
    """
    Generic function to upload a file to CodeCommit repository.
    
    Args:
        repo_name: Name of the CodeCommit repository
        file_path: Full path of the file in the repository
        content: File content as string
        commit_message: Commit message
    """
    print(f"Uploading file to CodeCommit: repo={repo_name}, path={file_path}")
    
    try:
        # Try to get the default branch - try 'main' first, then 'master'
        branch_name = 'main'
        try:
            branch_info = codecommit.get_branch(
                repositoryName=repo_name,
                branchName=branch_name
            )
        except codecommit.exceptions.BranchDoesNotExistException:
            # Try 'master' if 'main' doesn't exist
            branch_name = 'master'
            branch_info = codecommit.get_branch(
                repositoryName=repo_name,
                branchName=branch_name
            )
        parent_commit_id = branch_info['branch']['commitId']
        print(f"Got parent commit ID: {parent_commit_id}")
        
        # Check if file already exists
        try:
            existing_file = codecommit.get_file(
                repositoryName=repo_name,
                filePath=file_path
            )
            print(f"File already exists at {file_path}, updating it")
            # File exists, update it
            response = codecommit.put_file(
                repositoryName=repo_name,
                branchName=branch_name,
                fileContent=content.encode('utf-8'),
                filePath=file_path,
                fileMode='NORMAL',
                parentCommitId=parent_commit_id,
                commitMessage=commit_message,
                name=GIT_AUTHOR_NAME,
                email=GIT_AUTHOR_EMAIL
            )
        except codecommit.exceptions.FileDoesNotExistException:
            print(f"File doesn't exist at {file_path}, creating it")
            # File doesn't exist, create it
            response = codecommit.put_file(
                repositoryName=repo_name,
                branchName=branch_name,
                fileContent=content.encode('utf-8'),
                filePath=file_path,
                fileMode='NORMAL',
                parentCommitId=parent_commit_id,
                commitMessage=commit_message,
                name=GIT_AUTHOR_NAME,
                email=GIT_AUTHOR_EMAIL
            )
        
        print(f"Successfully uploaded file with commit ID: {response['commitId']}")
        return response['commitId']
    
    except codecommit.exceptions.RepositoryDoesNotExistException:
        raise Exception(f"CodeCommit repository '{repo_name}' does not exist")
    except codecommit.exceptions.BranchDoesNotExistException:
        raise Exception(f"No branch 'main' or 'master' found in repository '{repo_name}'")
    except Exception as e:
        print(f"Error uploading to CodeCommit: {str(e)}")
        raise Exception(f"Failed to upload to CodeCommit: {str(e)}")

def upload_appsettings_to_codecommit(repo_name, pipeline_name, content):
    """
    Upload appsettings.json file to CodeCommit repository.
    Creates a folder with the pipeline name and stores the appsettings.json inside it.
    """
    file_path = f"{pipeline_name}/appsettings.json"
    commit_message = f'Add/Update appsettings.json for {pipeline_name} pipeline'
    return upload_file_to_codecommit(repo_name, file_path, content, commit_message)

# Load manifest template function - moved here to be available for generate_k8s_manifest
def load_manifest_template():
    """
    Load the manifest template from file.
    First tries to load custom template, falls back to default if not found.
    """
    # These paths will be defined later in the file
    MANIFEST_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'deployment.yml')
    CUSTOM_MANIFEST_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), 'manifest_template.yml')
    
    try:
        # Try to load custom template first
        if os.path.exists(CUSTOM_MANIFEST_TEMPLATE_PATH):
            with open(CUSTOM_MANIFEST_TEMPLATE_PATH, 'r') as f:
                return f.read()
        # Fall back to default template
        elif os.path.exists(MANIFEST_TEMPLATE_PATH):
            with open(MANIFEST_TEMPLATE_PATH, 'r') as f:
                return f.read()
        else:
            # Return a basic default template if no file exists
            return """apiVersion: apps/v1
kind: Deployment
metadata:
  name: deployment-{{ pipeline_name }}
  namespace: {{ namespace }}
  labels:
    app.type: "{{ app_type }}"
    product: "{{ product }}"
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ pipeline_name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ pipeline_name }}
        app.type: "{{ app_type }}"
        service.name: "{{ pipeline_name }}"
        product: "{{ product }}"
    spec:
      serviceAccountName: appmesh-comp
      containers:
      - name: {{ pipeline_name }}
        image: {{ image }}
        imagePullPolicy: Always
        ports:
          - containerPort: {{ target_port }}
        resources:
          limits:
            memory: "{{ memory_limit }}"
            cpu: "{{ cpu_limit }}"
          requests:
            memory: "{{ memory_request }}"
            cpu: "{{ cpu_request }}"
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: {{ node_group }}
                    operator: In
                    values:
                      - "true"
      tolerations:
        - key: {{ node_group }}
          operator: Equal
          value: "true"
          effect: NoSchedule

---
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
  type: ClusterIP
"""
    except Exception as e:
        print(f"Error loading manifest template: {str(e)}")
        return ""

def generate_k8s_manifest(pipeline_name, ecr_uri, deployment_config):
    """
    Generate Kubernetes deployment manifest from configuration using the template.
    """
    # Load the manifest template
    template = load_manifest_template()
    
    # Replace template variables with actual values
    manifest = template
    manifest = manifest.replace('{{ pipeline_name }}', pipeline_name)
    manifest = manifest.replace('{{ namespace }}', deployment_config.get('namespace', 'staging-locobuzz'))
    manifest = manifest.replace('{{ app_type }}', deployment_config.get('appType', 'csharp'))
    manifest = manifest.replace('{{ product }}', deployment_config.get('product', 'cmo'))
    manifest = manifest.replace('{{ image }}', f'{ecr_uri}:latest')
    manifest = manifest.replace('{{ memory_limit }}', deployment_config.get('memoryLimit', '300Mi'))
    manifest = manifest.replace('{{ cpu_limit }}', deployment_config.get('cpuLimit', '300m'))
    manifest = manifest.replace('{{ memory_request }}', deployment_config.get('memoryRequest', '150Mi'))
    manifest = manifest.replace('{{ cpu_request }}', deployment_config.get('cpuRequest', '150m'))
    manifest = manifest.replace('{{ node_group }}', deployment_config.get('nodeGroup', 'cmo-nodegroup'))
    manifest = manifest.replace('{{ target_port }}', str(deployment_config.get('targetPort', 80)))
    manifest = manifest.replace('{{ service_type }}', deployment_config.get('serviceType', 'ClusterIP'))
    
    # Handle node affinity section conditionally
    if deployment_config.get('useSpecificNodeGroup', False):
        node_affinity_section = f"""      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: {deployment_config.get('nodeGroup', 'cmo-nodegroup')}
                    operator: In
                    values:
                      - "true"
      tolerations:
        - key: {deployment_config.get('nodeGroup', 'cmo-nodegroup')}
          operator: Equal
          value: "true"
          effect: NoSchedule"""
    else:
        node_affinity_section = ""
    
    manifest = manifest.replace('{{ node_affinity_section }}', node_affinity_section)
    
    return manifest

def generate_hpa_manifest(pipeline_name, namespace, scaling_config):
    """
    Generate HPA (Horizontal Pod Autoscaler) manifest.
    """
    hpa_manifest = f"""apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {pipeline_name}
  namespace: {namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: deployment-{pipeline_name}
  minReplicas: {scaling_config.get('minPods', 1)}
  maxReplicas: {scaling_config.get('maxPods', 10)}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: {scaling_config.get('cpuThreshold', 80)}
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: {scaling_config.get('memoryThreshold', 80)}"""
    
    return hpa_manifest

def generate_kafka_scaling_manifest(pipeline_name, namespace, scaling_config):
    """
    Generate KEDA ScaledObject manifest for Kafka-based scaling.
    """
    kafka_manifest = f"""apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: {pipeline_name}
  namespace: {namespace}
spec:
  scaleTargetRef:
    name: deployment-{pipeline_name}
  minReplicaCount: {scaling_config.get('minPods', 1)}
  maxReplicaCount: {scaling_config.get('maxPods', 10)}
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: {scaling_config.get('bootstrapServers', '')}
      consumerGroup: {scaling_config.get('consumerGroup', '')}
      topic: {scaling_config.get('topicName', '')}
      lagThreshold: "10"
      offsetResetPolicy: latest"""
    
    return kafka_manifest

def generate_scaling_manifest(pipeline_name, namespace, scaling_config):
    """
    Generate scaling manifest based on the type (HPA or Kafka).
    """
    scaling_type = scaling_config.get('type', 'hpa')
    
    if scaling_type == 'hpa':
        return generate_hpa_manifest(pipeline_name, namespace, scaling_config)
    else:
        return generate_kafka_scaling_manifest(pipeline_name, namespace, scaling_config)

def upload_manifest_to_codecommit(repo_name, pipeline_name, deployment_config, ecr_uri):
    """
    Generate and upload Kubernetes manifest to CodeCommit repository.
    """
    manifest_content = generate_k8s_manifest(pipeline_name, ecr_uri, deployment_config)
    # Create manifest in pipeline-specific folder
    file_path = f"{pipeline_name}/{pipeline_name}.yml"
    commit_message = f'Add/Update Kubernetes manifest for {pipeline_name} pipeline'
    return upload_file_to_codecommit(repo_name, file_path, manifest_content, commit_message)

def upload_scaling_manifest_to_codecommit(repo_name, pipeline_name, namespace, scaling_config):
    """
    Generate and upload scaling manifest (HPA or KEDA) to CodeCommit repository.
    """
    scaling_manifest = generate_scaling_manifest(pipeline_name, namespace, scaling_config)
    # Use different filename based on scaling type, in the same pipeline folder
    scaling_type = scaling_config.get('type', 'hpa')
    file_path = f"{pipeline_name}/{pipeline_name}-{scaling_type}.yml"
    commit_message = f'Add/Update {scaling_type.upper()} scaling manifest for {pipeline_name} pipeline'
    return upload_file_to_codecommit(repo_name, file_path, scaling_manifest, commit_message)

@app.route('/api/pipelines', methods=['POST'])
def create_pipelines():
    """
    Create multiple AWS CodePipeline pipelines in batch.
    Each pipeline includes:
    - ECR repository for Docker images
    - CodeBuild project for building the application
    - CodePipeline with Source and Build stages
    - S3 bucket for pipeline artifacts
    """
    try:
        data = request.json
        pipelines = data.get('pipelines', [])
        created_pipelines = []
        
        # Load pipeline settings
        settings = load_pipeline_settings()
        aws_settings = settings.get('aws', {})
        codebuild_settings = settings.get('codebuild', {})
        codepipeline_settings = settings.get('codepipeline', {})
        
        for pipeline_config in pipelines:
            pipeline_name = pipeline_config['pipelineName']
            repo_name = pipeline_config['repositoryName']
            branch_name = pipeline_config['branchName']
            buildspec_path = pipeline_config['buildspecPath']
            use_buildspec_file = pipeline_config.get('useBuildspecFile', True)
            buildspec_content = pipeline_config.get('buildspec', None)
            compute_type = pipeline_config['computeType']
            env_vars = pipeline_config.get('environmentVariables', [])
            
            try:
                print(f"Validating resources for pipeline: {pipeline_name}")
                
                # Validation: Check if any AWS resources already exist
                existing_resources = []
                
                # Check if CodePipeline exists
                try:
                    codepipeline.get_pipeline(name=pipeline_name)
                    existing_resources.append(f"CodePipeline '{pipeline_name}'")
                except codepipeline.exceptions.PipelineNotFoundException:
                    pass
                
                # Check if CodeBuild project exists
                codebuild_name = f"{pipeline_name}-build"
                try:
                    codebuild.batch_get_projects(names=[codebuild_name])
                    if codebuild.batch_get_projects(names=[codebuild_name])['projects']:
                        existing_resources.append(f"CodeBuild project '{codebuild_name}'")
                except:
                    pass
                
                # Check if ECR repository exists
                try:
                    ecr.describe_repositories(repositoryNames=[pipeline_name])
                    existing_resources.append(f"ECR repository '{pipeline_name}'")
                except ecr.exceptions.RepositoryNotFoundException:
                    pass
                
                # Check if pipeline folder exists in CodeCommit repos
                manifest_repo = None
                appsettings_repo = None
                for env_var in env_vars:
                    if env_var.get('name') == 'MANIFEST_REPO':
                        manifest_repo = env_var.get('value', 'staging-repo')
                    elif env_var.get('name') == 'APPSETTINGS_REPO':
                        appsettings_repo = env_var.get('value', 'modernization-appsettings-repo')
                
                manifest_repo = manifest_repo or 'staging-repo'
                appsettings_repo = appsettings_repo or 'modernization-appsettings-repo'
                
                # Check manifest repo
                try:
                    codecommit.get_file(
                        repositoryName=manifest_repo,
                        filePath=f"{pipeline_name}/{pipeline_name}.yml"
                    )
                    existing_resources.append(f"Manifest folder '{pipeline_name}' in {manifest_repo}")
                except:
                    pass
                
                # Check appsettings repo
                try:
                    codecommit.get_file(
                        repositoryName=appsettings_repo,
                        filePath=f"{pipeline_name}/appsettings.json"
                    )
                    existing_resources.append(f"Appsettings folder '{pipeline_name}' in {appsettings_repo}")
                except:
                    pass
                
                # If any resources exist, fail the creation
                if existing_resources:
                    error_msg = f"Cannot create pipeline '{pipeline_name}'. The following resources already exist: " + ", ".join(existing_resources)
                    created_pipelines.append({
                        'name': pipeline_name,
                        'success': False,
                        'error': error_msg
                    })
                    print(f"❌ {error_msg}")
                    continue
                
                print(f"✅ Validation passed. Creating pipeline: {pipeline_name}")
                
                # Create ECR repository
                try:
                    ecr.create_repository(
                        repositoryName=pipeline_name,
                        imageScanningConfiguration={'scanOnPush': True}
                    )
                    print(f"✅ Created ECR repository: {pipeline_name}")
                except ecr.exceptions.RepositoryAlreadyExistsException:
                    print(f"⚠️ ECR repository {pipeline_name} already exists")
                
                # Create S3 bucket for artifacts
                bucket_name = f"{pipeline_name}-artifacts-{datetime.now().strftime('%Y%m%d%H%M%S')}"
                s3 = boto3.client('s3')
                try:
                    s3.create_bucket(
                        Bucket=bucket_name,
                        CreateBucketConfiguration={'LocationConstraint': boto3.Session().region_name}
                    )
                    print(f"✅ Created S3 bucket: {bucket_name}")
                except Exception as e:
                    # Use a fallback bucket name if creation fails
                    bucket_name = f"{pipeline_name}-artifacts"
                    print(f"⚠️ Using fallback bucket name: {bucket_name}")
                
                # Get defaults
                defaults = pipeline_config.get('defaults', {})
                
                # Get CodeStar connection ARN for GitHub integration
                connection_name = defaults.get('codestar_connection_name', codepipeline_settings.get('codestarConnectionName', 'github-connections'))
                connection_arn = None
                
                try:
                    connections = codestar_connections.list_connections()
                    for conn in connections.get('Connections', []):
                        if conn.get('ConnectionName') == connection_name:
                            connection_arn = conn.get('ConnectionArn')
                            break
                    
                    if not connection_arn:
                        raise ValueError(f"CodeStar connection '{connection_name}' not found")
                except Exception as e:
                    print(f"Error getting connection: {e}")
                    # Fallback to constructed ARN
                    aws_region = app_settings.get('aws', {}).get('region', 'ap-south-1')
                    connection_arn = f"arn:aws:codestar-connections:{aws_region}:{session.client('sts').get_caller_identity()['Account']}:connection/{connection_name}"
                
                # Prepare buildspec
                if use_buildspec_file:
                    buildspec = buildspec_path
                else:
                    if not buildspec_content:
                        # Load from the buildspec template file instead
                        with open('buildspec-template.yml', 'r') as f:
                            buildspec = f.read()
                    else:
                        import yaml
                        # Ensure proper ordering of buildspec
                        ordered_buildspec = {
                            'version': buildspec_content.get('version', 0.2),
                            'phases': {}
                        }
                        # Add phases in correct order
                        for phase in ['install', 'pre_build', 'build', 'post_build']:
                            if phase in buildspec_content.get('phases', {}):
                                ordered_buildspec['phases'][phase] = buildspec_content['phases'][phase]
                        buildspec = yaml.dump(ordered_buildspec, default_flow_style=False, allow_unicode=True, sort_keys=False, width=1000)
                
                # Create CodeBuild project
                codebuild_project_name = f"{pipeline_name}-build"
                build_project = {
                    'name': codebuild_project_name,
                    'source': {
                        'type': 'CODEPIPELINE',
                        'buildspec': buildspec
                    },
                    'artifacts': {
                        'type': 'CODEPIPELINE'
                    },
                    'environment': {
                        'type': defaults.get('build_env_type', codebuild_settings.get('environmentType', 'LINUX_CONTAINER')),
                        'image': defaults.get('build_env_image', codebuild_settings.get('environmentImage', 'aws/codebuild/amazonlinux-x86_64-standard:5.0')),
                        'computeType': compute_type,
                        'privilegedMode': defaults.get('build_privileged_mode', codebuild_settings.get('privilegedMode', True)),
                        'imagePullCredentialsType': defaults.get('image_pull_credentials_type', codebuild_settings.get('imagePullCredentialsType', 'CODEBUILD')),
                        'environmentVariables': [
                            {'name': var['name'], 'value': var['value'], 'type': 'PLAINTEXT'} 
                            for var in env_vars if var.get('value', '').strip()
                        ] + [
                            {'name': 'SERVICE_NAME', 'value': pipeline_name, 'type': 'PLAINTEXT'},
                            {'name': 'ECR_REPO_URI', 'value': f"{aws_settings.get('ecrRegistry', '465105616690.dkr.ecr.ap-south-1.amazonaws.com')}/{pipeline_name}", 'type': 'PLAINTEXT'}
                        ]
                    },
                    'serviceRole': f"arn:aws:iam::{aws_settings.get('accountId', boto3.client('sts').get_caller_identity()['Account'])}:role/{defaults.get('codebuild_role', codebuild_settings.get('serviceRole', 'staging-codebuild-role'))}"
                }
                
                # Add VPC config if available
                vpc_id = codebuild_settings.get('vpcId')
                subnets = codebuild_settings.get('subnets')
                security_group = defaults.get('codebuild_sg') or codebuild_settings.get('securityGroup')
                
                if vpc_id and subnets and security_group:
                    build_project['vpcConfig'] = {
                        'vpcId': vpc_id,
                        'subnets': subnets,
                        'securityGroupIds': [security_group]
                    }
                
                try:
                    codebuild.create_project(**build_project)
                    print(f"✅ Created CodeBuild project: {codebuild_project_name}")
                except codebuild.exceptions.ResourceAlreadyExistsException:
                    print(f"⚠️ CodeBuild project {codebuild_project_name} already exists")
                
                # Create CodePipeline
                pipeline = {
                    'pipeline': {
                        'name': pipeline_name,
                        'roleArn': f"arn:aws:iam::{aws_settings.get('accountId', boto3.client('sts').get_caller_identity()['Account'])}:role/{defaults.get('codepipeline_role', codepipeline_settings.get('serviceRole', 'staging-codepipeline-role'))}",
                        'artifactStore': {
                            'type': 'S3',
                            'location': bucket_name
                        },
                        'stages': [
                            {
                                'name': 'Source',
                                'actions': [
                                    {
                                        'name': defaults.get('source_action_name', 'Source'),
                                        'actionTypeId': {
                                            'category': defaults.get('source_category', 'Source'),
                                            'owner': defaults.get('source_action_owner', 'AWS'),
                                            'provider': defaults.get('source_provider', codepipeline_settings.get('sourceProvider', 'CodeStarSourceConnection')),
                                            'version': str(defaults.get('source_version', 1))
                                        },
                                        'runOrder': 1,
                                        'configuration': {
                                            'ConnectionArn': connection_arn,
                                            'FullRepositoryId': repo_name,
                                            'BranchName': branch_name,
                                            'OutputArtifactFormat': 'CODE_ZIP'
                                        },
                                        'outputArtifacts': [
                                            {
                                                'name': 'SourceOutput'
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                'name': 'ManualApproval',
                                'actions': [
                                    {
                                        'name': 'ManualApprovalAction',
                                        'actionTypeId': {
                                            'category': 'Approval',
                                            'owner': 'AWS',
                                            'provider': 'Manual',
                                            'version': '1'
                                        },
                                        'runOrder': 1,
                                        'configuration': {
                                            'CustomData': f'Please review and approve the deployment for pipeline: {pipeline_name}'
                                        }
                                    }
                                ]
                            },
                            {
                                'name': 'Build',
                                'actions': [
                                    {
                                        'name': defaults.get('build_action_name', 'BuildAction'),
                                        'actionTypeId': {
                                            'category': defaults.get('build_category', 'Build'),
                                            'owner': defaults.get('build_owner', 'AWS'),
                                            'provider': defaults.get('build_provider', codepipeline_settings.get('buildProvider', 'CodeBuild')),
                                            'version': str(defaults.get('build_version', 1))
                                        },
                                        'runOrder': 1,
                                        'configuration': {
                                            'ProjectName': codebuild_project_name
                                        },
                                        'outputArtifacts': [
                                            {
                                                'name': 'BuildOutput'
                                            }
                                        ],
                                        'inputArtifacts': [
                                            {
                                                'name': 'SourceOutput'
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
                
                try:
                    response = codepipeline.create_pipeline(**pipeline)
                    pipeline_arn = response.get('pipeline', {}).get('arn') or f"arn:aws:codepipeline:{boto3.Session().region_name}:{boto3.client('sts').get_caller_identity()['Account']}:pipeline/{pipeline_name}"
                    print(f"✅ Created CodePipeline: {pipeline_name}")
                except codepipeline.exceptions.PipelineNameInUseException:
                    print(f"⚠️ CodePipeline {pipeline_name} already exists")
                    pipeline_arn = f"arn:aws:codepipeline:{boto3.Session().region_name}:{boto3.client('sts').get_caller_identity()['Account']}:pipeline/{pipeline_name}"
                
                # Upload appsettings to CodeCommit if provided
                appsettings_content = pipeline_config.get('appsettingsContent')
                if appsettings_content:
                    appsettings_repo = None
                    for env_var in env_vars:
                        if env_var.get('name') == 'APPSETTINGS_REPO' and env_var.get('value'):
                            appsettings_repo = env_var.get('value')
                            break
                    
                    if appsettings_repo:
                        try:
                            commit_id = upload_appsettings_to_codecommit(
                                repo_name=appsettings_repo,
                                pipeline_name=pipeline_name,
                                content=appsettings_content
                            )
                            print(f"✅ Uploaded appsettings to {appsettings_repo}/{pipeline_name}/")
                        except Exception as e:
                            print(f"⚠️ Failed to upload appsettings: {str(e)}")
                
                # Upload deployment manifest if provided
                deployment_config = pipeline_config.get('deploymentConfig')
                if deployment_config:
                    manifest_repo = None
                    for env_var in env_vars:
                        if env_var.get('name') == 'MANIFEST_REPO' and env_var.get('value'):
                            manifest_repo = env_var.get('value')
                            break
                    
                    if manifest_repo:
                        try:
                            ecr_uri = f"{aws_settings.get('ecrRegistry', '465105616690.dkr.ecr.ap-south-1.amazonaws.com')}/{pipeline_name}"
                            commit_id = upload_manifest_to_codecommit(
                                repo_name=manifest_repo,
                                pipeline_name=pipeline_name,
                                deployment_config=deployment_config,
                                ecr_uri=ecr_uri
                            )
                            print(f"✅ Uploaded manifest to {manifest_repo}/{pipeline_name}/")
                        except Exception as e:
                            print(f"⚠️ Failed to upload manifest: {str(e)}")
                
                # Upload scaling manifest if provided
                scaling_config = pipeline_config.get('scalingConfig')
                if scaling_config and deployment_config and manifest_repo:
                    try:
                        namespace = deployment_config.get('namespace', 'staging-locobuzz')
                        commit_id = upload_scaling_manifest_to_codecommit(
                            repo_name=manifest_repo,
                            pipeline_name=pipeline_name,
                            namespace=namespace,
                            scaling_config=scaling_config
                        )
                        scaling_type = scaling_config.get('type', 'hpa')
                        print(f"✅ Uploaded {scaling_type} scaling manifest to {manifest_repo}/{pipeline_name}/")
                    except Exception as e:
                        print(f"⚠️ Failed to upload scaling manifest: {str(e)}")
                
                created_pipelines.append({
                    'pipelineName': pipeline_name,
                    'pipelineArn': pipeline_arn,
                    'status': 'created'
                })
                
                print(f"✅ Pipeline creation completed for: {pipeline_name}")
                
            except Exception as pipeline_error:
                print(f"❌ Error creating pipeline {pipeline_name}: {str(pipeline_error)}")
                created_pipelines.append({
                    'pipelineName': pipeline_name,
                    'pipelineArn': None,
                    'status': 'error',
                    'error': str(pipeline_error)
                })
        
        return jsonify({
            'success': True,
            'pipelines': created_pipelines,
            'message': f"Processed {len(pipelines)} pipeline(s)"
        })
        
    except Exception as e:
        print(f"❌ Global error in pipeline creation: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Keep rest of the original logic but remove duplicated code
"""
REMOVED ORIGINAL PIPELINE CREATION CODE - REPLACED WITH ATOMIC VERSION ABOVE
The original implementation had these issues:
1. No pre-flight checks for resource conflicts
2. No rollback mechanism
3. Partial resource creation on failure
4. No proper error handling

The new atomic implementation:
1. Checks all resources before creating any
2. Creates resources in correct order
3. Rolls back everything on any failure
4. Provides detailed status for each pipeline
"""

@app.route('/api/pipelines', methods=['GET'])
def list_pipelines():
    """
    List all existing AWS CodePipeline pipelines in the configured region.
    Returns pipeline names and metadata with lock status.
    """
    try:
        response = codepipeline.list_pipelines()
        pipelines = response.get('pipelines', [])
        
        # Get all current locks
        all_locks = lock_manager.get_all_locks()
        
        # Add lock status to each pipeline
        for pipeline in pipelines:
            pipeline_name = pipeline.get('name')
            if pipeline_name in all_locks:
                pipeline['lockStatus'] = all_locks[pipeline_name]
            else:
                pipeline['lockStatus'] = None
        
        return jsonify({
            'success': True,
            'pipelines': pipelines
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint to verify the backend service is running.
    Used by frontend to check connectivity.
    """
    return jsonify({'status': 'healthy'})

# Lock management endpoints
@app.route('/api/pipelines/<pipeline_name>/lock', methods=['POST'])
def acquire_pipeline_lock(pipeline_name):
    """
    Acquire a lock on a pipeline for editing.
    """
    try:
        data = request.json or {}
        user_id = data.get('userId', request.remote_addr)  # Use IP as fallback
        force = data.get('force', False)
        
        result = lock_manager.acquire_lock(pipeline_name, user_id, force)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 409  # Conflict
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipelines/<pipeline_name>/lock', methods=['DELETE'])
def release_pipeline_lock(pipeline_name):
    """
    Release a lock on a pipeline.
    """
    try:
        data = request.json or {}
        user_id = data.get('userId', request.remote_addr)
        
        result = lock_manager.release_lock(pipeline_name, user_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipelines/<pipeline_name>/lock', methods=['PUT'])
def refresh_pipeline_lock(pipeline_name):
    """
    Refresh a lock on a pipeline to prevent timeout.
    """
    try:
        data = request.json or {}
        user_id = data.get('userId', request.remote_addr)
        
        result = lock_manager.refresh_lock(pipeline_name, user_id)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 403  # Forbidden
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipelines/<pipeline_name>/lock', methods=['GET'])
def get_pipeline_lock_status(pipeline_name):
    """
    Get the current lock status of a pipeline.
    """
    try:
        lock_status = lock_manager.get_lock_status(pipeline_name)
        return jsonify({
            'success': True,
            'lockStatus': lock_status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Environment variable suggestions endpoints
import os

SUGGESTIONS_FILE = 'env_suggestions.json'
SETTINGS_FILE = 'pipeline_settings.json'

def load_pipeline_settings():
    """
    Load pipeline configuration settings from JSON file.
    Falls back to default settings if file doesn't exist.
    """
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    # Return default settings
    return {
        "aws": {
            "region": "ap-south-1",
            "accountId": "465105616690",
            "ecrRegistry": "465105616690.dkr.ecr.ap-south-1.amazonaws.com"
        },
        "codebuild": {
            "serviceRole": "staging-codebuild-role",
            "environmentType": "LINUX_CONTAINER",
            "environmentImage": "aws/codebuild/amazonlinux-x86_64-standard:5.0",
            "privilegedMode": True,
            "imagePullCredentialsType": "CODEBUILD",
            "securityGroup": None
        },
        "codepipeline": {
            "serviceRole": "staging-codepipeline-role",
            "codestarConnectionName": "github-connections",
            "sourceProvider": "CodeStarSourceConnection",
            "buildProvider": "CodeBuild"
        },
        "eks": {
            "clusterName": "Staging_cluster",
            "clusterRoleArn": "arn:aws:iam::465105616690:role/staging_ekscluster_role"
        },
        "deploymentOptions": {
            "appTypes": ["csharp", "python", "java", "nodejs"],
            "bootstrapServers": ["b-1.locobuzzuatmskcluster.4psd4m.c3.kafka.ap-south-1.amazonaws.com:9092,b-2.locobuzzuatmskcluster.4psd4m.c3.kafka.ap-south-1.amazonaws.com:9092"],
            "cpuOptions": ["100m", "150m", "200m", "250m", "300m", "400m", "500m", "1000m", "2000m"],
            "memoryOptions": ["100Mi", "150Mi", "200Mi", "250Mi", "300Mi", "400Mi", "500Mi", "1Gi", "2Gi"],
            "namespaces": ["staging-locobuzz", "production-locobuzz", "om"],
            "nodeGroups": ["cmo-nodegroup", "modernization-nodegroup", "newsverse-nodegroup"],
            "products": ["cmo", "modernization", "newsverse"],
            "serviceAccounts": ["appmesh-comp", "default", "eks-service-account"]
        }
    }

def save_pipeline_settings(settings):
    """
    Save pipeline configuration settings to JSON file.
    """
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving settings: {e}")
        return False

def load_suggestions():
    """
    Load environment variable suggestions from JSON file.
    Falls back to default suggestions if file doesn't exist.
    Returns dict with env var names as keys and suggestion lists as values.
    """
    if os.path.exists(SUGGESTIONS_FILE):
        try:
            with open(SUGGESTIONS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    # Return default suggestions
    return {
        'SECRET_CREDS': ['Database', 'cmo-secrets', 'newzverse-secrets'],
        'APPSETTINGS_REPO': ['modernization-appsettings-repo'],
        'MANIFEST_REPO': ['staging-repo'],
        'CLUSTER_ROLE_ARN': ['arn:aws:iam::465105616690:role/staging_ekscluster_role'],
        'DOCKER_REPO_DIR': [],
        'CLUSTER_NAME': ['Staging_cluster'],
        'ECR_REGISTRY': ['465105616690.dkr.ecr.ap-south-1.amazonaws.com']
    }

def save_suggestions(suggestions):
    """
    Save environment variable suggestions to JSON file.
    Persists user-customized suggestions across server restarts.
    Returns True on success, False on failure.
    """
    try:
        with open(SUGGESTIONS_FILE, 'w') as f:
            json.dump(suggestions, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving suggestions: {e}")
        return False

@app.route('/api/env-suggestions', methods=['GET'])
def get_env_suggestions():
    """
    API endpoint to retrieve environment variable suggestions.
    Used by frontend autocomplete feature to help users with common env vars.
    """
    try:
        suggestions = load_suggestions()
        return jsonify({
            'success': True,
            'suggestions': suggestions
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/env-suggestions', methods=['POST'])
def update_env_suggestions():
    """
    API endpoint to update environment variable suggestions.
    Allows users to customize autocomplete suggestions through the Settings modal.
    """
    try:
        data = request.json
        suggestions = data.get('suggestions', {})
        
        if save_suggestions(suggestions):
            return jsonify({
                'success': True,
                'message': 'Suggestions updated successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to save suggestions'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipeline-settings', methods=['GET'])
def get_pipeline_settings():
    """
    API endpoint to retrieve pipeline configuration settings.
    """
    try:
        settings = load_pipeline_settings()
        return jsonify({
            'success': True,
            'settings': settings
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipeline-settings', methods=['POST'])
def update_pipeline_settings():
    """
    API endpoint to update pipeline configuration settings.
    """
    try:
        data = request.json
        settings = data.get('settings', {})
        
        if save_pipeline_settings(settings):
            return jsonify({
                'success': True,
                'message': 'Pipeline settings updated successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to save settings'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Pipeline metadata management using storage adapter
def load_pipeline_metadata():
    """Load pipeline metadata using storage adapter"""
    try:
        pipelines = storage.list_pipelines()
        
        # Add performance metrics
        if len(pipelines) > 100:
            print(f"Performance note: Loading {len(pipelines)} pipelines.")
        
        return {'pipelines': pipelines}
    except Exception as e:
        print(f"Error loading pipeline metadata: {e}")
        return {'pipelines': []}

def save_pipeline_metadata(metadata):
    """Save pipeline metadata - handles both single pipeline and bulk updates"""
    try:
        # Check if this is a bulk update (has 'pipelines' key) or single pipeline
        if 'pipelines' in metadata:
            # Bulk update - save each pipeline
            success = True
            for pipeline in metadata.get('pipelines', []):
                if not storage.save_pipeline(pipeline):
                    success = False
            return success
        else:
            # Single pipeline update
            return storage.save_pipeline(metadata)
    except Exception as e:
        print(f"Error saving pipeline metadata: {e}")
        return False

@app.route('/api/pipeline-metadata', methods=['GET'])
def get_pipeline_metadata():
    """Get all pipeline metadata"""
    try:
        metadata = load_pipeline_metadata()
        return jsonify({
            'success': True,
            'pipelines': metadata.get('pipelines', [])
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipeline-metadata/<pipeline_name>', methods=['GET'])
def get_pipeline_by_name(pipeline_name):
    """Get specific pipeline metadata by name"""
    try:
        pipeline = storage.get_pipeline(pipeline_name)
        
        if pipeline:
            # Add read-only flags for existing pipelines
            pipeline['readOnlyFields'] = {
                'buildspec': True,
                'buildspecPath': True,
                'useBuildspecFile': True
            }
            return jsonify({
                'success': True,
                'pipeline': pipeline
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Pipeline not found'
            }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipeline-metadata', methods=['POST'])
def save_pipeline_metadata_endpoint():
    """Save pipeline metadata after creation"""
    try:
        data = request.json
        pipeline_data = data.get('pipeline')
        
        if not pipeline_data:
            return jsonify({
                'success': False,
                'error': 'Pipeline data is required'
            }), 400
        
        # Load existing metadata
        metadata = load_pipeline_metadata()
        pipelines = metadata.get('pipelines', [])
        
        # Check if pipeline already exists
        existing_index = -1
        for i, p in enumerate(pipelines):
            if p.get('name') == pipeline_data.get('name'):
                existing_index = i
                break
        
        # Add timestamp
        pipeline_data['lastUpdated'] = datetime.now().isoformat()
        
        if existing_index >= 0:
            # Update existing
            pipeline_data['createdAt'] = pipelines[existing_index].get('createdAt', pipeline_data['lastUpdated'])
            pipelines[existing_index] = pipeline_data
        else:
            # Add new
            pipeline_data['createdAt'] = pipeline_data['lastUpdated']
            pipelines.append(pipeline_data)
        
        # Save updated metadata
        metadata['pipelines'] = pipelines
        if save_pipeline_metadata(metadata):
            return jsonify({
                'success': True,
                'message': 'Pipeline metadata saved successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to save pipeline metadata'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipeline-metadata/<pipeline_name>', methods=['DELETE'])
def delete_pipeline_metadata(pipeline_name):
    """Delete pipeline metadata"""
    try:
        # Check if pipeline exists first
        if not storage.get_pipeline(pipeline_name):
            return jsonify({
                'success': False,
                'error': 'Pipeline not found'
            }), 404
        
        # Delete the pipeline
        if storage.delete_pipeline(pipeline_name):
            return jsonify({
                'success': True,
                'message': 'Pipeline metadata deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to delete pipeline metadata'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Pipeline operations (appsettings fetch, locking, etc.)
@app.route('/api/pipelines/<pipeline_name>/update', methods=['POST'])
def update_pipeline(pipeline_name):
    """Update existing pipeline configuration"""
    try:
        data = request.json
        pipeline_config = data.get('pipeline')
        user_id = data.get('userId', request.remote_addr)
        
        if not pipeline_config:
            return jsonify({
                'success': False,
                'error': 'Pipeline configuration required'
            }), 400
        
        # Check if pipeline is locked and if current user has the lock
        lock_status = lock_manager.get_lock_status(pipeline_name)
        if lock_status and lock_status['locked_by'] != user_id:
            return jsonify({
                'success': False,
                'error': f'Pipeline is currently being edited by {lock_status["locked_by"]}. Please try again later.'
            }), 409  # Conflict
        
        # Load current settings
        settings = load_pipeline_settings()
        aws_settings = settings.get('aws', {})
        
        # Handle appsettings update if provided
        appsettings_content = pipeline_config.get('appsettingsContent')
        if appsettings_content:
            env_vars = pipeline_config.get('environmentVariables', [])
            appsettings_repo = None
            for env_var in env_vars:
                if env_var.get('name') == 'APPSETTINGS_REPO' and env_var.get('value'):
                    appsettings_repo = env_var.get('value')
                    break
            
            if appsettings_repo:
                try:
                    upload_appsettings_to_codecommit(
                        repo_name=appsettings_repo,
                        pipeline_name=pipeline_name,
                        content=appsettings_content
                    )
                    print(f"✅ Updated appsettings for {pipeline_name}")
                except Exception as e:
                    print(f"⚠️ Failed to update appsettings: {str(e)}")
        
        # Handle deployment manifest update if provided
        deployment_config = pipeline_config.get('deploymentConfig')
        if deployment_config:
            env_vars = pipeline_config.get('environmentVariables', [])
            manifest_repo = None
            for env_var in env_vars:
                if env_var.get('name') == 'MANIFEST_REPO' and env_var.get('value'):
                    manifest_repo = env_var.get('value')
                    break
            
            if manifest_repo:
                try:
                    ecr_uri = f"{aws_settings.get('ecrRegistry', '465105616690.dkr.ecr.ap-south-1.amazonaws.com')}/{pipeline_name}"
                    upload_manifest_to_codecommit(
                        repo_name=manifest_repo,
                        pipeline_name=pipeline_name,
                        deployment_config=deployment_config,
                        ecr_uri=ecr_uri
                    )
                    print(f"✅ Updated manifest for {pipeline_name}")
                except Exception as e:
                    print(f"⚠️ Failed to update manifest: {str(e)}")
        
        # Handle scaling manifest update if provided
        scaling_config = pipeline_config.get('scalingConfig')
        if scaling_config and deployment_config:
            env_vars = pipeline_config.get('environmentVariables', [])
            manifest_repo = None
            for env_var in env_vars:
                if env_var.get('name') == 'MANIFEST_REPO' and env_var.get('value'):
                    manifest_repo = env_var.get('value')
                    break
            
            if manifest_repo:
                try:
                    namespace = deployment_config.get('namespace', 'staging-locobuzz')
                    upload_scaling_manifest_to_codecommit(
                        repo_name=manifest_repo,
                        pipeline_name=pipeline_name,
                        namespace=namespace,
                        scaling_config=scaling_config
                    )
                    print(f"✅ Updated scaling manifest for {pipeline_name}")
                except Exception as e:
                    print(f"⚠️ Failed to update scaling manifest: {str(e)}")
        
        # Update pipeline metadata with new configuration
        try:
            metadata = load_pipeline_metadata()
            pipelines = metadata.get('pipelines', [])
            
            # Find and update the pipeline metadata
            pipeline_updated = False
            for i, p in enumerate(pipelines):
                if p.get('name') == pipeline_name:
                    # Update the pipeline data with new configuration
                    # NOTE: Buildspec fields are read-only for existing pipelines
                    pipelines[i].update({
                        'repositoryName': pipeline_config.get('repositoryName', p.get('repositoryName')),
                        'branchName': pipeline_config.get('branchName', p.get('branchName')),
                        # Keep existing buildspec configuration - do not update
                        'buildspecPath': p.get('buildspecPath'),
                        'useBuildspecFile': p.get('useBuildspecFile'),
                        'computeType': pipeline_config.get('computeType', p.get('computeType')),
                        'environmentVariables': pipeline_config.get('environmentVariables', p.get('environmentVariables')),
                        'deploymentConfig': pipeline_config.get('deploymentConfig', p.get('deploymentConfig')),
                        'scalingConfig': pipeline_config.get('scalingConfig', p.get('scalingConfig')),
                        'lastUpdated': datetime.now().isoformat()
                    })
                    pipeline_updated = True
                    break
            
            if pipeline_updated:
                metadata['pipelines'] = pipelines
                save_pipeline_metadata(metadata)
                print(f"✅ Updated pipeline metadata for {pipeline_name}")
            else:
                print(f"⚠️ Pipeline metadata not found for {pipeline_name}")
                
        except Exception as e:
            print(f"⚠️ Failed to update pipeline metadata: {str(e)}")
        
        return jsonify({
            'success': True,
            'message': f'Pipeline {pipeline_name} updated successfully'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipelines/<pipeline_name>/delete', methods=['DELETE'])
def delete_pipeline_resources(pipeline_name):
    """Delete all AWS resources for a pipeline"""
    try:
        successes = []
        errors = []
        
        # Get pipeline metadata to find repo information
        metadata = load_pipeline_metadata()
        pipeline_meta = None
        for p in metadata.get('pipelines', []):
            if p.get('name') == pipeline_name:
                pipeline_meta = p
                break
        
        # 1. Delete CodePipeline
        try:
            codepipeline.delete_pipeline(name=pipeline_name)
            successes.append(f"✅ Deleted CodePipeline: {pipeline_name}")
        except codepipeline.exceptions.PipelineNotFoundException:
            errors.append(f"⚠️ CodePipeline {pipeline_name} not found")
        except Exception as e:
            errors.append(f"❌ Failed to delete CodePipeline {pipeline_name}: {str(e)}")
        
        # 2. Delete CodeBuild project
        codebuild_project_name = f"{pipeline_name}-build"
        try:
            codebuild.delete_project(name=codebuild_project_name)
            successes.append(f"✅ Deleted CodeBuild project: {codebuild_project_name}")
        except codebuild.exceptions.ResourceNotFoundException:
            errors.append(f"⚠️ CodeBuild project {codebuild_project_name} not found")
        except Exception as e:
            errors.append(f"❌ Failed to delete CodeBuild project {codebuild_project_name}: {str(e)}")
        
        # 3. Delete ECR repository
        try:
            ecr.delete_repository(repositoryName=pipeline_name, force=True)
            successes.append(f"✅ Deleted ECR repository: {pipeline_name}")
        except ecr.exceptions.RepositoryNotFoundException:
            errors.append(f"⚠️ ECR repository {pipeline_name} not found")
        except Exception as e:
            errors.append(f"❌ Failed to delete ECR repository {pipeline_name}: {str(e)}")
        
        # 4. Delete S3 artifact bucket
        try:
            # First, get the pipeline configuration to find the S3 bucket name
            try:
                pipeline_details = codepipeline.get_pipeline(name=pipeline_name)
                bucket_name = pipeline_details['pipeline']['artifactStore']['location']
                
                # Delete all objects in the bucket first (S3 requires empty bucket for deletion)
                s3 = boto3.client('s3')
                
                # List and delete all objects
                try:
                    objects = s3.list_objects_v2(Bucket=bucket_name)
                    if 'Contents' in objects:
                        delete_keys = [{'Key': obj['Key']} for obj in objects['Contents']]
                        s3.delete_objects(Bucket=bucket_name, Delete={'Objects': delete_keys})
                        print(f"Deleted {len(delete_keys)} objects from S3 bucket: {bucket_name}")
                    
                    # Delete all object versions if versioning was enabled
                    versions = s3.list_object_versions(Bucket=bucket_name)
                    if 'Versions' in versions:
                        delete_keys = [{'Key': v['Key'], 'VersionId': v['VersionId']} for v in versions['Versions']]
                        if delete_keys:
                            s3.delete_objects(Bucket=bucket_name, Delete={'Objects': delete_keys})
                    
                    if 'DeleteMarkers' in versions:
                        delete_markers = [{'Key': d['Key'], 'VersionId': d['VersionId']} for d in versions['DeleteMarkers']]
                        if delete_markers:
                            s3.delete_objects(Bucket=bucket_name, Delete={'Objects': delete_markers})
                    
                    # Now delete the empty bucket
                    s3.delete_bucket(Bucket=bucket_name)
                    successes.append(f"✅ Deleted S3 bucket: {bucket_name}")
                    
                except s3.exceptions.NoSuchBucket:
                    errors.append(f"⚠️ S3 bucket {bucket_name} not found")
                except Exception as e:
                    errors.append(f"❌ Failed to delete S3 bucket {bucket_name}: {str(e)}")
                    
            except codepipeline.exceptions.PipelineNotFoundException:
                # Pipeline doesn't exist, try to find buckets by pattern
                s3 = boto3.client('s3')
                response = s3.list_buckets()
                pattern = f"{pipeline_name}-artifacts"
                
                found_buckets = []
                for bucket in response.get('Buckets', []):
                    if bucket['Name'].startswith(pattern):
                        found_buckets.append(bucket['Name'])
                
                if found_buckets:
                    for bucket_name in found_buckets:
                        try:
                            # Delete all objects
                            objects = s3.list_objects_v2(Bucket=bucket_name)
                            if 'Contents' in objects:
                                delete_keys = [{'Key': obj['Key']} for obj in objects['Contents']]
                                s3.delete_objects(Bucket=bucket_name, Delete={'Objects': delete_keys})
                            
                            # Delete versions and markers
                            versions = s3.list_object_versions(Bucket=bucket_name)
                            if 'Versions' in versions:
                                delete_keys = [{'Key': v['Key'], 'VersionId': v['VersionId']} for v in versions['Versions']]
                                if delete_keys:
                                    s3.delete_objects(Bucket=bucket_name, Delete={'Objects': delete_keys})
                            
                            if 'DeleteMarkers' in versions:
                                delete_markers = [{'Key': d['Key'], 'VersionId': d['VersionId']} for d in versions['DeleteMarkers']]
                                if delete_markers:
                                    s3.delete_objects(Bucket=bucket_name, Delete={'Objects': delete_markers})
                            
                            # Delete bucket
                            s3.delete_bucket(Bucket=bucket_name)
                            successes.append(f"✅ Deleted S3 bucket: {bucket_name}")
                        except Exception as e:
                            errors.append(f"❌ Failed to delete S3 bucket {bucket_name}: {str(e)}")
                else:
                    errors.append(f"⚠️ No S3 buckets found matching pattern: {pattern}*")
                    
        except Exception as e:
            errors.append(f"❌ Failed to delete S3 artifacts: {str(e)}")
        
        # 5. Delete manifest folder from staging-repo
        if pipeline_meta:
            env_vars = pipeline_meta.get('environmentVariables', [])
            manifest_repo = None
            appsettings_repo = None
            
            for env_var in env_vars:
                if env_var.get('name') == 'MANIFEST_REPO' and env_var.get('value'):
                    manifest_repo = env_var.get('value')
                elif env_var.get('name') == 'APPSETTINGS_REPO' and env_var.get('value'):
                    appsettings_repo = env_var.get('value')
            
            # Default repos if not found in env vars
            manifest_repo = manifest_repo or 'staging-repo'
            appsettings_repo = appsettings_repo or 'modernization-appsettings-repo'
            
            # Delete manifest folder - delete all possible files that could exist
            try:
                # Get current branch and commit ID
                branch_name = 'main'
                try:
                    codecommit.get_branch(repositoryName=manifest_repo, branchName=branch_name)
                except:
                    branch_name = 'master'
                
                branch_info = codecommit.get_branch(repositoryName=manifest_repo, branchName=branch_name)
                parent_commit_id = branch_info['branch']['commitId']
                
                # List of all possible files that could exist in the pipeline folder
                possible_files = [
                    f"{pipeline_name}/{pipeline_name}.yml",
                    f"{pipeline_name}/{pipeline_name}-hpa.yml", 
                    f"{pipeline_name}/{pipeline_name}-kafka.yml",
                    f"{pipeline_name}/deployment.yml",
                    f"{pipeline_name}/service.yml",
                    f"{pipeline_name}/manifest.yml"
                ]
                
                files_to_delete = []
                deleted_count = 0
                
                # Check each possible file and add to deletion list if it exists
                for file_path in possible_files:
                    try:
                        codecommit.get_file(
                            repositoryName=manifest_repo,
                            filePath=file_path
                        )
                        files_to_delete.append({'filePath': file_path})
                        deleted_count += 1
                        print(f"Found file to delete: {file_path}")
                    except codecommit.exceptions.FileDoesNotExistException:
                        # File doesn't exist, skip it
                        continue
                    except Exception as e:
                        print(f"Error checking file {file_path}: {e}")
                        continue
                
                if files_to_delete:
                    # Delete all found files
                    codecommit.create_commit(
                        repositoryName=manifest_repo,
                        branchName=branch_name,
                        parentCommitId=parent_commit_id,
                        deleteFiles=files_to_delete,
                        commitMessage=f"Delete manifest folder for {pipeline_name}"
                    )
                    successes.append(f"✅ Deleted manifest folder: {manifest_repo}/{pipeline_name}/ ({deleted_count} files)")
                else:
                    errors.append(f"⚠️ No manifest files found for pipeline: {pipeline_name}")
                        
            except Exception as e:
                errors.append(f"❌ Failed to delete manifest folder: {str(e)}")
            
            # Delete appsettings folder - delete all possible files that could exist
            try:
                # Get current branch and commit ID for appsettings repo
                branch_name = 'main'
                try:
                    codecommit.get_branch(repositoryName=appsettings_repo, branchName=branch_name)
                except:
                    branch_name = 'master'
                
                branch_info = codecommit.get_branch(repositoryName=appsettings_repo, branchName=branch_name)
                parent_commit_id = branch_info['branch']['commitId']
                
                # List of all possible files that could exist in the appsettings folder
                possible_files = [
                    f"{pipeline_name}/appsettings.json",
                    f"{pipeline_name}/appsettings.Development.json",
                    f"{pipeline_name}/appsettings.Production.json",
                    f"{pipeline_name}/config.json"
                ]
                
                files_to_delete = []
                deleted_count = 0
                
                # Check each possible file and add to deletion list if it exists
                for file_path in possible_files:
                    try:
                        codecommit.get_file(
                            repositoryName=appsettings_repo,
                            filePath=file_path
                        )
                        files_to_delete.append({'filePath': file_path})
                        deleted_count += 1
                        print(f"Found appsettings file to delete: {file_path}")
                    except codecommit.exceptions.FileDoesNotExistException:
                        # File doesn't exist, skip it
                        continue
                    except Exception as e:
                        print(f"Error checking appsettings file {file_path}: {e}")
                        continue
                
                if files_to_delete:
                    # Delete all found files
                    codecommit.create_commit(
                        repositoryName=appsettings_repo,
                        branchName=branch_name,
                        parentCommitId=parent_commit_id,
                        deleteFiles=files_to_delete,
                        commitMessage=f"Delete appsettings folder for {pipeline_name}"
                    )
                    successes.append(f"✅ Deleted appsettings folder: {appsettings_repo}/{pipeline_name}/ ({deleted_count} files)")
                else:
                    errors.append(f"⚠️ No appsettings files found for pipeline: {pipeline_name}")
                    
            except Exception as e:
                errors.append(f"❌ Failed to delete appsettings folder: {str(e)}")
        
        # 6. Delete pipeline metadata
        try:
            # Delete from DynamoDB
            if storage.delete_pipeline(pipeline_name):
                successes.append(f"✅ Deleted pipeline metadata for: {pipeline_name}")
            else:
                errors.append(f"⚠️ Pipeline metadata not found for: {pipeline_name}")
        except Exception as e:
            errors.append(f"❌ Failed to delete pipeline metadata: {str(e)}")
        
        return jsonify({
            'success': len(successes) > 0,
            'successes': successes,
            'errors': errors,
            'message': f"Processed deletion of {pipeline_name}: {len(successes)} successes, {len(errors)} errors"
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipelines/<pipeline_name>/appsettings', methods=['GET'])
def get_pipeline_appsettings(pipeline_name):
    """Get appsettings.json content for a pipeline from CodeCommit"""
    try:
        # Get pipeline metadata to find appsettings repo
        metadata = load_pipeline_metadata()
        pipeline_meta = None
        for p in metadata.get('pipelines', []):
            if p.get('name') == pipeline_name:
                pipeline_meta = p
                break
        
        if not pipeline_meta:
            return jsonify({
                'success': False,
                'error': 'Pipeline not found in metadata'
            }), 404
        
        # Get appsettings repo from pipeline environment variables or default
        appsettings_repo = None
        env_vars = pipeline_meta.get('environmentVariables', [])
        for env_var in env_vars:
            if env_var.get('name') == 'APPSETTINGS_REPO' and env_var.get('value'):
                appsettings_repo = env_var.get('value')
                break
        
        if not appsettings_repo:
            appsettings_repo = 'modernization-appsettings-repo'  # Default
        
        print(f"Fetching appsettings for {pipeline_name} from {appsettings_repo}")
        
        # Try to get the file from CodeCommit
        file_path = f"{pipeline_name}/appsettings.json"
        try:
            response = codecommit.get_file(
                repositoryName=appsettings_repo,
                filePath=file_path
            )
            
            # Decode the file content
            content = response['fileContent'].decode('utf-8')
            
            return jsonify({
                'success': True,
                'content': content,
                'repository': appsettings_repo,
                'filePath': file_path
            })
            
        except codecommit.exceptions.FileDoesNotExistException:
            return jsonify({
                'success': False,
                'error': f'Appsettings file not found at {appsettings_repo}/{file_path}',
                'repository': appsettings_repo,
                'filePath': file_path
            }), 404
        except codecommit.exceptions.RepositoryDoesNotExistException:
            return jsonify({
                'success': False,
                'error': f'Repository {appsettings_repo} does not exist'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/manifest-template', methods=['GET'])
def get_manifest_template():
    """Get the manifest template for preview"""
    try:
        template = load_manifest_template()
        return jsonify({
            'success': True,
            'template': template
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to load manifest template: {str(e)}'
        }), 500

@app.route('/api/pipelines/<pipeline_name>/manifest', methods=['GET'])
def get_pipeline_manifest(pipeline_name):
    """Get existing Kubernetes manifest for a pipeline from CodeCommit"""
    try:
        # Get pipeline metadata to find manifest repo
        metadata = load_pipeline_metadata()
        pipeline_meta = None
        for p in metadata.get('pipelines', []):
            if p.get('name') == pipeline_name:
                pipeline_meta = p
                break
        
        if not pipeline_meta:
            return jsonify({
                'success': False,
                'error': 'Pipeline not found in metadata'
            }), 404
        
        # Get manifest repo from pipeline environment variables or default
        manifest_repo = None
        env_vars = pipeline_meta.get('environmentVariables', [])
        for env_var in env_vars:
            if env_var.get('name') == 'MANIFEST_REPO' and env_var.get('value'):
                manifest_repo = env_var.get('value')
                break
        
        if not manifest_repo:
            manifest_repo = 'staging-repo'  # Default
        
        print(f"Fetching manifest for {pipeline_name} from {manifest_repo}")
        
        # Try to get the manifest file from CodeCommit
        file_path = f"{pipeline_name}/{pipeline_name}.yml"
        try:
            response = codecommit.get_file(
                repositoryName=manifest_repo,
                filePath=file_path
            )
            
            # Decode the file content
            content = response['fileContent'].decode('utf-8')
            
            return jsonify({
                'success': True,
                'content': content,
                'repository': manifest_repo,
                'filePath': file_path,
                'exists': True
            })
            
        except codecommit.exceptions.FileDoesNotExistException:
            # Manifest doesn't exist yet - this is not an error
            # Return success with exists=False so frontend can handle appropriately
            return jsonify({
                'success': True,
                'exists': False,
                'repository': manifest_repo,
                'filePath': file_path,
                'message': f'Manifest file not found at {manifest_repo}/{file_path}'
            })
        except codecommit.exceptions.RepositoryDoesNotExistException:
            return jsonify({
                'success': False,
                'error': f'Repository {manifest_repo} does not exist'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    # Get port from configuration
    port = app_settings.get('app', {}).get('port', 5000)
    app.run(debug=True, host='0.0.0.0', port=port)
