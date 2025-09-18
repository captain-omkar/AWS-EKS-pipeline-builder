#\!/usr/bin/env python3
import sys

# Read the file
with open(sys.argv[1], 'r') as f:
    lines = f.readlines()

# Find the start and end indices
start_idx = None
end_idx = None

for i, line in enumerate(lines):
    if "# Create S3 bucket for artifacts with simple naming" in line:
        start_idx = i
    if start_idx is not None and 'raise Exception(f"Failed to create S3 bucket: {str(e)}")' in line:
        end_idx = i
        break

if start_idx is not None and end_idx is not None:
    # Prepare the replacement lines
    replacement = '''                # Use shared S3 bucket from configuration
                s3_config = app_settings.get('s3', {})
                bucket_name = s3_config.get('sharedBucketName')
                
                if not bucket_name:
                    raise Exception("Shared S3 bucket name not configured in appsettings.json. Please set 's3.sharedBucketName' in configuration.")
                
                print(f"Using shared S3 bucket: {bucket_name}")
                
                # Verify the shared bucket exists and is accessible
                s3 = boto3.client('s3')
                try:
                    s3.head_bucket(Bucket=bucket_name)
                    print(f"✅ Verified access to shared S3 bucket: {bucket_name}")
                    # Note: We don't add bucket to created_resources since we're not creating it
                except s3.exceptions.NoSuchBucket:
                    raise Exception(f"Shared S3 bucket '{bucket_name}' does not exist. Please create it first.")
                except Exception as e:
                    raise Exception(f"Cannot access shared S3 bucket '{bucket_name}': {str(e)}")
'''
    
    # Replace the lines
    lines[start_idx:end_idx+1] = [replacement + '\n']
    
    # Write back
    with open(sys.argv[1], 'w') as f:
        f.writelines(lines)
    
    print(f"Successfully replaced lines {start_idx} to {end_idx}")
else:
    print(f"Could not find the section to replace. Start: {start_idx}, End: {end_idx}")
