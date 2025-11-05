#!/usr/bin/env python3
import requests
import json
import time

# Create a test pipeline
test_pipeline = {
    "pipelines": [{
        "pipelineName": "test-phase-order-fix",
        "repositoryName": "test/repo",
        "branchName": "main",
        "buildspecPath": "buildspec.yml",
        "useBuildspecFile": False,  # Use template instead of file
        "computeType": "BUILD_GENERAL1_SMALL",
        "environmentVariables": [
            {"name": "MANIFEST_REPO", "value": "manifest-repository"},
            {"name": "APPSETTINGS_REPO", "value": "appsettings-repository"}
        ]
    }]
}

print("Creating test pipeline...")
response = requests.post('http://localhost:5000/api/pipelines', 
                        json=test_pipeline,
                        headers={'Content-Type': 'application/json'})

if response.status_code == 200:
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")
else:
    print(f"Failed with status {response.status_code}: {response.text}")

# Wait a moment then check the buildspec in CodeBuild
time.sleep(2)

# Check the created project
import boto3
session = boto3.Session(region_name='us-east-1')
codebuild = session.client('codebuild')

try:
    response = codebuild.batch_get_projects(names=['test-phase-order-fix-build'])
    if response['projects']:
        project = response['projects'][0]
        buildspec = project['source'].get('buildspec', 'Using file')
        if isinstance(buildspec, str) and len(buildspec) > 100:
            print("\nBuildspec in CodeBuild project:")
            print("First 800 chars:")
            print(buildspec[:800])
            
            # Check phase order
            import yaml
            parsed = yaml.safe_load(buildspec)
            if 'phases' in parsed:
                print("\nPhase order in CodeBuild:")
                for i, phase in enumerate(parsed['phases']):
                    print(f"  {i+1}. {phase}")
        else:
            print(f"Buildspec: {buildspec}")
except Exception as e:
    print(f"Error checking CodeBuild project: {e}")