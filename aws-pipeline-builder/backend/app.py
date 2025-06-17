from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json
from datetime import datetime

# Initialize Flask application with CORS support for cross-origin requests
app = Flask(__name__)
CORS(app)

# Initialize AWS service clients with ap-south-1 region
codepipeline = boto3.client('codepipeline', region_name='ap-south-1')
codebuild = boto3.client('codebuild', region_name='ap-south-1')
codestar_connections = boto3.client('codestar-connections', region_name='ap-south-1')
ecr = boto3.client('ecr', region_name='ap-south-1')

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
        
        for pipeline_config in pipelines:
            pipeline_name = pipeline_config['pipelineName']
            repo_name = pipeline_config['repositoryName']
            branch_name = pipeline_config['branchName']
            buildspec_path = pipeline_config['buildspecPath']
            use_buildspec_file = pipeline_config.get('useBuildspecFile', True)
            buildspec_content = pipeline_config.get('buildspec', None)
            compute_type = pipeline_config['computeType']
            env_vars = pipeline_config.get('environmentVariables', [])
            
            # Get default values from frontend or use defaults
            defaults = pipeline_config.get('defaults', {})
            
            # Get the correct CodeStar connection ARN for GitHub integration
            connection_name = defaults.get('codestar_connection_name', 'github-connections')
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
                # Fallback to constructed ARN (may not work)
                connection_arn = f"arn:aws:codestar-connections:ap-south-1:{boto3.client('sts').get_caller_identity()['Account']}:connection/{connection_name}"
            
            # Create ECR repository with the pipeline name for storing Docker images
            try:
                ecr.create_repository(
                    repositoryName=pipeline_name,
                    imageScanningConfiguration={
                        'scanOnPush': True
                    }
                )
                print(f"Created ECR repository: {pipeline_name}")
            except ecr.exceptions.RepositoryAlreadyExistsException:
                print(f"ECR repository {pipeline_name} already exists")
            except Exception as e:
                print(f"Error creating ECR repository: {e}")
            
            # Create CodeBuild project for building and pushing Docker images
            codebuild_project_name = f"{pipeline_name}-build"
            
            # Prepare buildspec - support both file path reference and inline YAML content
            if use_buildspec_file:
                buildspec = buildspec_path
            else:
                # Convert the buildspec object to YAML format
                import yaml
                buildspec = yaml.dump(buildspec_content, default_flow_style=False)
            
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
                    'type': defaults.get('build_env_type', 'LINUX_CONTAINER'),
                    'image': defaults.get('build_env_image', 'aws/codebuild/amazonlinux-x86_64-standard:5.0'),
                    'computeType': compute_type,
                    'privilegedMode': defaults.get('build_privileged_mode', True),
                    'imagePullCredentialsType': defaults.get('image_pull_credentials_type', 'CODEBUILD'),
                    'environmentVariables': [
                        {'name': var['name'], 'value': var['value'], 'type': 'PLAINTEXT'} 
                        for var in env_vars if var.get('value', '').strip()  # Only include env vars with values
                    ] + [
                        {'name': 'SERVICE_NAME', 'value': pipeline_name, 'type': 'PLAINTEXT'},
                        {'name': 'ECR_REPO_URI', 'value': f"465105616690.dkr.ecr.ap-south-1.amazonaws.com/{pipeline_name}", 'type': 'PLAINTEXT'}
                    ]
                },
                'serviceRole': f"arn:aws:iam::{boto3.client('sts').get_caller_identity()['Account']}:role/{defaults.get('codebuild_role', 'staging-codebuild-role')}"
            }
            
            # Add VPC config if security group is provided for private subnet builds
            if defaults.get('codebuild_sg'):
                build_project['vpcConfig'] = {
                    'securityGroupIds': [defaults.get('codebuild_sg')]
                }
            
            try:
                codebuild.create_project(**build_project)
            except codebuild.exceptions.ResourceAlreadyExistsException:
                # Update existing project
                codebuild.update_project(**build_project)
            
            # Create CodePipeline configuration with Source and Build stages
            pipeline = {
                'pipeline': {
                    'name': pipeline_name,
                    'roleArn': f"arn:aws:iam::{boto3.client('sts').get_caller_identity()['Account']}:role/{defaults.get('codepipeline_role', 'staging-codepipeline-role')}",
                    'artifactStore': {
                        'type': 'S3',
                        'location': f"{pipeline_name}-artifacts-{datetime.now().strftime('%Y%m%d%H%M%S')}"
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
                                        'provider': defaults.get('source_provider', 'CodeStarSourceConnection'),
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
                            'name': 'Build',
                            'actions': [
                                {
                                    'name': defaults.get('build_action_name', 'BuildAction'),
                                    'actionTypeId': {
                                        'category': defaults.get('build_category', 'Build'),
                                        'owner': defaults.get('build_owner', 'AWS'),
                                        'provider': defaults.get('build_provider', 'CodeBuild'),
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
            
            # Create S3 bucket for storing pipeline artifacts with unique timestamp
            s3 = boto3.client('s3')
            try:
                s3.create_bucket(
                    Bucket=pipeline['pipeline']['artifactStore']['location'],
                    CreateBucketConfiguration={'LocationConstraint': boto3.Session().region_name}
                )
            except s3.exceptions.BucketAlreadyExists:
                pass
            
            # Create the pipeline in AWS CodePipeline
            try:
                response = codepipeline.create_pipeline(**pipeline)
                # Extract pipeline ARN from response
                pipeline_arn = response.get('pipeline', {}).get('arn')
                if not pipeline_arn:
                    # Construct ARN if not in response
                    pipeline_arn = f"arn:aws:codepipeline:{boto3.Session().region_name}:{boto3.client('sts').get_caller_identity()['Account']}:pipeline/{pipeline_name}"
                
                created_pipelines.append({
                    'pipelineName': pipeline_name,
                    'pipelineArn': pipeline_arn,
                    'status': 'created'
                })
            except Exception as pipeline_error:
                # If pipeline already exists, try to update it
                if 'already exists' in str(pipeline_error):
                    created_pipelines.append({
                        'pipelineName': pipeline_name,
                        'pipelineArn': f"arn:aws:codepipeline:{boto3.Session().region_name}:{boto3.client('sts').get_caller_identity()['Account']}:pipeline/{pipeline_name}",
                        'status': 'already_exists'
                    })
                else:
                    raise pipeline_error
        
        return jsonify({
            'success': True,
            'pipelines': created_pipelines
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pipelines', methods=['GET'])
def list_pipelines():
    """
    List all existing AWS CodePipeline pipelines in the configured region.
    Returns pipeline names and metadata.
    """
    try:
        response = codepipeline.list_pipelines()
        return jsonify({
            'success': True,
            'pipelines': response.get('pipelines', [])
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

# Environment variable suggestions endpoints
import os

SUGGESTIONS_FILE = 'env_suggestions.json'

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
        'SMCREDS': ['Database', 'cmo-secrets', 'newzverse-secrets'],
        'APPSETTINGS_REPO': ['modernization-appsettings-repo'],
        'MANIFEST_REPO': [],
        'CLUSTER_ROLE_ARN': [],
        'DOCKER_REPO_DIR': []
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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)