# Buildspec Phase Order Fix

## Problem
The buildspec phases were appearing in alphabetical order (build, install, post_build, pre_build) instead of the correct execution order (install, pre_build, build, post_build) when saved and retrieved from the backend.

## Root Cause
1. Python's `yaml.dump()` function sorts dictionary keys alphabetically by default
2. When buildspec YAML is loaded and converted to a dictionary, the phase order could be lost if not explicitly preserved

## Solution Implemented

### Backend Changes (app.py)

1. **Added OrderedDict import** at the top of the file:
   ```python
   from collections import OrderedDict
   ```

2. **Updated buildspec template POST endpoint** to preserve phase order when saving:
   ```python
   # Ensure phases are in correct order
   if 'phases' in buildspec and isinstance(buildspec['phases'], dict):
       ordered_phases = OrderedDict()
       phase_order = ['install', 'pre_build', 'build', 'post_build']
       for phase in phase_order:
           if phase in buildspec['phases']:
               ordered_phases[phase] = buildspec['phases'][phase]
       buildspec['phases'] = ordered_phases
   
   buildspec_yaml = yaml.dump(buildspec, default_flow_style=False, sort_keys=False)
   ```

3. **Updated buildspec template GET endpoint** to ensure correct phase order when loading:
   - When loading from DynamoDB
   - When loading from file
   - When using hardcoded defaults

4. **Used OrderedDict for hardcoded buildspec** to ensure phase order is maintained

### Frontend Changes (Settings.tsx)

1. **Updated buildspec loading** to maintain phase order:
   ```typescript
   const orderedBuildspec: any = {};
   // Version should come first
   if (buildspec.version !== undefined) {
     orderedBuildspec.version = buildspec.version;
   }
   
   // Then phases in the correct order
   if (buildspec.phases) {
     orderedBuildspec.phases = {};
     const phaseOrder = ['install', 'pre_build', 'build', 'post_build'];
     phaseOrder.forEach(phase => {
       if ((buildspec.phases as any)[phase]) {
         orderedBuildspec.phases[phase] = (buildspec.phases as any)[phase];
       }
     });
   }
   ```

2. **Updated YAML dumping** to preserve order:
   ```typescript
   const yamlStr = yaml.dump(orderedBuildspec, {
     indent: 2,
     lineWidth: -1,
     noRefs: true,
     sortKeys: false,
     noCompatMode: true
   });
   ```

3. **Added phase ordering when saving** buildspec to ensure consistency

## Testing

Created a utility script `clear_buildspec_template.py` to clear existing buildspec templates from DynamoDB for testing.

## Result

The buildspec phases now maintain the correct execution order:
1. install
2. pre_build  
3. build
4. post_build

This order is preserved when:
- Loading buildspec template in Settings modal
- Saving buildspec template from Settings modal
- Creating new pipelines with the buildspec template
- Retrieving buildspec from the backend API