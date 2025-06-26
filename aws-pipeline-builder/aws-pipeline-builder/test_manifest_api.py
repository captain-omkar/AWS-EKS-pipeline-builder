#!/usr/bin/env python3
"""
Test script to verify the manifest fetch API endpoint
"""
import requests
import json

# API endpoint URL (adjust if needed)
API_URL = "http://localhost:5000"

def test_manifest_endpoint(pipeline_name):
    """Test fetching manifest for a pipeline"""
    try:
        response = requests.get(f"{API_URL}/api/pipelines/{pipeline_name}/manifest")
        
        print(f"Testing pipeline: {pipeline_name}")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('exists'):
                print(f"\nManifest found at: {data.get('repository')}/{data.get('filePath')}")
                print(f"Content preview: {data.get('content', '')[:200]}...")
            else:
                print(f"\nManifest not found: {data.get('message')}")
        else:
            print(f"\nError: {response.text}")
            
    except Exception as e:
        print(f"Error testing endpoint: {e}")

if __name__ == "__main__":
    # Test with a sample pipeline name
    test_manifest_endpoint("test-pipeline")
    
    # You can add more pipeline names to test
    # test_manifest_endpoint("another-pipeline")