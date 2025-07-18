#!/usr/bin/env python3
import requests
import json

# Create a test pipeline with inline buildspec (not using file)
test_pipeline = {
    "pipelines": [{
        "pipelineName": "test-debug-buildspec",
        "repositoryName": "test/repo",
        "branchName": "main",
        "buildspecPath": "buildspec.yml",
        "useBuildspecFile": False,  # This should use the template
        "computeType": "BUILD_GENERAL1_SMALL",
        "environmentVariables": [
            {"name": "MANIFEST_REPO", "value": "staging-repo"},
            {"name": "APPSETTINGS_REPO", "value": "modernization-appsettings-repo"}
        ]
    }]
}

print("Creating test pipeline with useBuildspecFile=False...")
response = requests.post('http://localhost:5000/api/pipelines', 
                        json=test_pipeline,
                        headers={'Content-Type': 'application/json'})

print(f"Status: {response.status_code}")
print(f"Response: {response.text}")