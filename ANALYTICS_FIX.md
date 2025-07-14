# Analytics Fix - Double Counting Issue

## Problem Identified
The backup job counter in global analytics was increasing by 2 for each backup job, and success rates were being affected.

## Root Cause
Both frontend and backend were independently tracking analytics for the same backup job:
- Frontend: Dashboard.js was calling `recordBackupStart()`, `recordBackupSuccess()`, and `recordBackupFailure()`
- Backend: BackupService.js was also calling analytics methods through AnalyticsService

This resulted in:
1. **Double counting**: Each backup job counted as 2 jobs in global analytics
2. **Success rate issues**: Potential inconsistencies when one tracker succeeded and another failed
3. **Different instance IDs**: Frontend and backend used different ID generation patterns

## Solution Applied
1. **Removed frontend analytics tracking**: Eliminated duplicate calls from Dashboard.js
2. **Centralized to backend-only**: Only BackupService.js now tracks analytics
3. **Persistent instance ID**: Backend now uses a persistent instance ID stored in `data/instance_id.txt`

## Changes Made
- `frontend/src/components/Dashboard.js`: Removed analytics import and calls
- `backend/services/AnalyticsService.js`: Added persistent instance ID functionality
- `backend/services/BackupService.js`: Updated constructor to pass dataDir to AnalyticsService

## Benefits
- ✅ Accurate job counting (1 job = 1 count)
- ✅ Reliable success rate calculation
- ✅ Consistent analytics tracking
- ✅ Backend-only tracking is more reliable (always executes)
- ✅ Persistent instance ID across restarts

## Testing
After applying this fix, backup jobs should:
1. Only increment global counter by 1
2. Show accurate success rates
3. Use consistent instance identification
