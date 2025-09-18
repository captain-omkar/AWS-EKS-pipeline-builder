#\!/usr/bin/env python3
"""
Fix for pipeline creation returning success when no pipelines are created
"""

# Read the file
with open('/home/ubuntu/projects/devops-18-sept/aws-pipeline-builder-v2/aws-pipeline-builder/backend/app.py', 'r') as f:
    content = f.read()

# Find and replace the logic
old_logic = '''        else:
            # All pipelines succeeded
            return jsonify({
                'success': True,
                'pipelines': created_pipelines,
                'message': f"Successfully created {len(successful_pipelines)} pipeline(s)"
            })'''

new_logic = '''        else:
            # Check if any pipelines were actually created
            if len(created_pipelines) == 0:
                return jsonify({
                    'success': False,
                    'pipelines': [],
                    'message': "No pipelines were processed. Please check your input.",
                    'error': 'No pipelines to create'
                }), 400
            # All pipelines succeeded
            return jsonify({
                'success': True,
                'pipelines': created_pipelines,
                'message': f"Successfully created {len(successful_pipelines)} pipeline(s)"
            })'''

# Replace the content
content = content.replace(old_logic, new_logic)

# Write back
with open('/home/ubuntu/projects/devops-18-sept/aws-pipeline-builder-v2/aws-pipeline-builder/backend/app.py', 'w') as f:
    f.write(content)

print("Fixed pipeline creation logic")
