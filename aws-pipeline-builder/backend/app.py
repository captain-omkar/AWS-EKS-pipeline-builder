from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

codepipeline = boto3.client('codepipeline')
codebuild = boto3.client('codebuild')

@app.route('/api/pipelines', methods=['POST'])
def create_pipelines():
    try:
        data = request.json
        pipelines = data.get('pipelines', [])
        created_pipelines = []
        
        for pipeline_config in pipelines:
            pipeline_name = pipeline_config['pipelineName']
            repo_name = pipeline_config['repositoryName']
            branch_name = pipeline_config['branchName']
            buildspec_path = pipeline_config['buildspecPath']
            compute_type = pipeline_config['computeType']
            env_vars = pipeline_config.get('environmentVariables', [])
            
            # Get default values from frontend or use defaults
            defaults = pipeline_config.get('defaults', {})
            
            # Create CodeBuild project first
            codebuild_project_name = f"{pipeline_name}-build"
            
            build_project = {
                'name': codebuild_project_name,
                'source': {
                    'type': 'CODEPIPELINE',
                    'buildspec': buildspec_path
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
                        for var in env_vars
                    ]
                },
                'serviceRole': f"arn:aws:iam::{boto3.client('sts').get_caller_identity()['Account']}:role/{defaults.get('codebuild_role', 'staging-codebuild-role')}"
            }
            
            # Add VPC config if security group is provided
            if defaults.get('codebuild_sg'):
                build_project['vpcConfig'] = {
                    'securityGroupIds': [defaults.get('codebuild_sg')]
                }
            
            try:
                codebuild.create_project(**build_project)
            except codebuild.exceptions.ResourceAlreadyExistsException:
                # Update existing project
                codebuild.update_project(**build_project)
            
            # Create Pipeline
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
                                        'ConnectionArn': f"arn:aws:codestar-connections:{boto3.Session().region_name}:{boto3.client('sts').get_caller_identity()['Account']}:connection/{defaults.get('codestar_connection_name', 'github-connections')}",
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
            
            # Create S3 bucket for artifacts
            s3 = boto3.client('s3')
            try:
                s3.create_bucket(
                    Bucket=pipeline['pipeline']['artifactStore']['location'],
                    CreateBucketConfiguration={'LocationConstraint': boto3.Session().region_name}
                )
            except s3.exceptions.BucketAlreadyExists:
                pass
            
            # Create the pipeline
            response = codepipeline.create_pipeline(**pipeline)
            created_pipelines.append({
                'pipelineName': pipeline_name,
                'pipelineArn': response['pipeline']['arn']
            })
        
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
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)