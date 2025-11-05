#!/usr/bin/env python3
import boto3
import yaml

session = boto3.Session(region_name='us-east-1')
codebuild = session.client('codebuild')

try:
    projects = codebuild.list_projects()
    if projects['projects']:
        # Check a few recent projects
        for project_name in projects['projects'][:3]:
            print(f'\nChecking project: {project_name}')
            response = codebuild.batch_get_projects(names=[project_name])
            if response['projects']:
                project = response['projects'][0]
                buildspec = project['source'].get('buildspec', 'Using file')
                if isinstance(buildspec, str) and buildspec != 'buildspec.yml':
                    print('Buildspec content found inline')
                    # Parse YAML to check phase order
                    try:
                        parsed = yaml.safe_load(buildspec)
                        if 'phases' in parsed:
                            print('Phase order in buildspec:')
                            for i, phase in enumerate(parsed['phases']):
                                print(f'  {i+1}. {phase}')
                    except:
                        print('Could not parse buildspec YAML')
                else:
                    print(f'Using buildspec file: {buildspec}')
except Exception as e:
    print(f'Error: {e}')