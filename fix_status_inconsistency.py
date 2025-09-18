#\!/usr/bin/env python3
"""
Fix status inconsistency in pipeline creation responses
"""

# Read the file
with open('/home/ubuntu/projects/devops-18-sept/aws-pipeline-builder-v2/aws-pipeline-builder/backend/app.py', 'r') as f:
    content = f.read()

# Replace 'success': False with 'status': 'error' pattern
content = content.replace(
    """created_pipelines.append({
                    'name': pipeline_name,
                    'success': False,
                    'error': error_msg
                })""",
    """created_pipelines.append({
                    'pipelineName': pipeline_name,
                    'pipelineArn': None,
                    'status': 'error',
                    'error': error_msg
                })"""
)

# Also fix the existing resources check
content = content.replace(
    """created_pipelines.append({
                        'name': pipeline_name,
                        'success': False,
                        'error': error_msg
                    })""",
    """created_pipelines.append({
                        'pipelineName': pipeline_name,
                        'pipelineArn': None,
                        'status': 'error',
                        'error': error_msg
                    })"""
)

# Write back
with open('/home/ubuntu/projects/devops-18-sept/aws-pipeline-builder-v2/aws-pipeline-builder/backend/app.py', 'w') as f:
    f.write(content)

print("Fixed status inconsistency in pipeline creation")
