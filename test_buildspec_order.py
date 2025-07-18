#!/usr/bin/env python3
import requests
import json

# Test the buildspec template endpoint
response = requests.get('http://localhost:5000/api/buildspec-template')
if response.status_code == 200:
    data = response.json()
    if data.get('success'):
        buildspec = data.get('buildspec', {})
        if 'phases' in buildspec:
            print("Buildspec phases order from API:")
            for i, phase in enumerate(buildspec['phases'].keys()):
                print(f"  {i+1}. {phase}")
        else:
            print("No phases found in buildspec")
    else:
        print(f"API returned error: {data.get('error')}")
else:
    print(f"API request failed with status: {response.status_code}")
    print(response.text)