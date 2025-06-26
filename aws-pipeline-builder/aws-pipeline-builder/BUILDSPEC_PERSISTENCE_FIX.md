# Buildspec Template Persistence Fix

## Issue
The buildspec template was not persisting in the Settings modal. Users reported that the buildspec was gone from the master template in the settings modal, even though it should have been saved in DynamoDB.

## Root Causes Identified

1. **Race Condition in Settings Component**: The `fetchPipelineSettings()` and `fetchBuildspecTemplate()` functions were running in parallel, causing the pipeline settings to overwrite the buildspec template that was just loaded.

2. **YAML Serialization Issue**: The backend was using `OrderedDict` with `yaml.dump()` which created Python-specific YAML tags (`!!python/object/apply:collections.OrderedDict`), corrupting the stored template in DynamoDB.

## Fixes Applied

### 1. Frontend: Fixed Race Condition (Settings.tsx)
- Modified the `useEffect` hook to load buildspec template AFTER pipeline settings
- This ensures that the buildspec template is not overwritten by the pipeline settings load
- Also fixed the pipeline settings to preserve existing buildspec if available

### 2. Backend: Fixed YAML Serialization (app.py)
- Changed the buildspec template save endpoint to use regular dictionaries instead of OrderedDict
- Added `Dumper=yaml.SafeDumper` to prevent Python-specific tags in YAML
- This ensures clean YAML is stored in DynamoDB

### 3. Data Repair
- The corrupted buildspec template in DynamoDB was repaired by reloading from the file-based template
- Verified that the template now loads correctly without Python-specific tags

## Testing
- Created and ran test scripts to verify:
  - Buildspec template exists in DynamoDB
  - API endpoint returns the buildspec correctly
  - All phases (install, pre_build, build, post_build) are present with commands

## Result
The buildspec template now:
- Persists correctly in DynamoDB
- Loads properly in the Settings modal
- Maintains proper YAML format without corruption
- Preserves all phases and commands as expected