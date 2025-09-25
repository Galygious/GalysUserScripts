/**
 * OAuth Scopes required for this script
 * @fileoverview This script requires access to Google Sheets and Drive
 */

/**
 * This function is here to ensure proper OAuth scopes are requested
 * It won't be called directly but helps Apps Script determine required permissions
 */
function getOAuthScopes() {
    SpreadsheetApp.getActiveSpreadsheet(); // Request Sheets access
    DriveApp.getFiles(); // Request Drive access
    PropertiesService.getScriptProperties(); // Request Properties access
    UrlFetchApp.fetch('https://example.com'); // Request URL fetch access
  }
  
  // Configuration loaded from Script Properties
  function getConfig() {
    const properties = PropertiesService.getScriptProperties();
    
    // Parse allowed origins if they exist
    let allowedOrigins = [];
    const originsProperty = properties.getProperty('ALLOWED_ORIGINS');
    if (originsProperty) {
      try {
        allowedOrigins = JSON.parse(originsProperty);
      } catch (error) {
        console.error('Error parsing ALLOWED_ORIGINS:', error);
        allowedOrigins = [];
      }
    }
    
    // Parse spreadsheet IDs dictionary
    let spreadsheetIds = {};
    const spreadsheetIdsProperty = properties.getProperty('SPREADSHEET_IDS');
    if (spreadsheetIdsProperty) {
      try {
        spreadsheetIds = JSON.parse(spreadsheetIdsProperty);
      } catch (error) {
        console.error('Error parsing SPREADSHEET_IDS:', error);
        spreadsheetIds = {};
      }
    }
    
    // Backward compatibility: check for old SPREADSHEET_ID property
    const legacySpreadsheetId = properties.getProperty('SPREADSHEET_ID');
    if (legacySpreadsheetId && !spreadsheetIds.BROADCAST) {
      spreadsheetIds.BROADCAST = legacySpreadsheetId;
    }
    
    return {
      // ACCESS_CONTROL_FILE_ID removed - simplified to only broadcast spreadsheet access
      SPREADSHEET_IDS: spreadsheetIds,
      ALLOWED_ORIGINS: allowedOrigins,
      DEBUG_SPREADSHEET_ID: properties.getProperty('DEBUG_SPREADSHEET_ID')
    };
  }
  
  function logRequest(method, requestData, responseData, error = null) {
    try {
      const config = getConfig();
      if (!config.DEBUG_SPREADSHEET_ID) {
        console.log('No DEBUG_SPREADSHEET_ID configured - logging skipped');
        return; // No logging if DEBUG_SPREADSHEET_ID not set
      }
      
      const debugSheet = SpreadsheetApp.openById(config.DEBUG_SPREADSHEET_ID).getSheets()[0];
      
      // Create header row if sheet is empty
      if (debugSheet.getLastRow() === 0) {
        debugSheet.getRange(1, 1, 1, 12).setValues([[
          'Timestamp',
          'Method', 
          'Origin',
          'User Agent',
          'Referer',
          'Action',
          'User Email',
          'Request Data',
          'Response Status',
          'Response Data',
          'Error',
          'Debug Info'
        ]]);
      }
      
      const timestamp = new Date().toISOString();
      const origin = requestData.origin || 'Unknown';
      const userAgent = requestData.userAgent || 'Unknown';
      const referer = requestData.referer || 'Unknown';
      const action = requestData.action || 'Unknown';
      const userEmail = requestData.userEmail || 'Unknown';
      const requestDataStr = JSON.stringify(requestData).substring(0, 1000); // Limit length
      const responseStatus = error ? 'ERROR' : 'SUCCESS';
      const responseDataStr = JSON.stringify(responseData).substring(0, 1000); // Limit length
      const errorStr = error ? error.toString().substring(0, 500) : '';
      const debugInfo = JSON.stringify({
        hasBroadcastId: !!config.SPREADSHEET_IDS.BROADCAST,
        allowedOriginsCount: config.ALLOWED_ORIGINS?.length || 0,
        spreadsheetIds: Object.keys(config.SPREADSHEET_IDS || {})
      });
      
      debugSheet.appendRow([
        timestamp,
        method,
        origin,
        userAgent,
        referer,
        action,
        userEmail,
        requestDataStr,
        responseStatus,
        responseDataStr,
        errorStr,
        debugInfo
      ]);
      
      console.log('Request logged to debug sheet');
    } catch (logError) {
      console.error('Failed to log request:', logError.toString());
      throw logError; // Re-throw so we can see the error in test function
    }
  }
  
  /**
   * TEST FUNCTION - Run this from the Apps Script editor to test logging
   * This function can be executed directly from the Apps Script interface
   */
  function testLogging() {
    console.log('=== TESTING LOGGING FUNCTION ===');
    
    try {
      const config = getConfig();
      console.log('Configuration loaded:', {
        hasDebugId: !!config.DEBUG_SPREADSHEET_ID,
        debugId: config.DEBUG_SPREADSHEET_ID,
        hasAccessControl: !!config.ACCESS_CONTROL_FILE_ID,
        hasBroadcastId: !!config.SPREADSHEET_IDS.BROADCAST
      });
      
      if (!config.DEBUG_SPREADSHEET_ID) {
        console.error('❌ DEBUG_SPREADSHEET_ID is not set in Script Properties');
        return 'FAILED: DEBUG_SPREADSHEET_ID not configured';
      }
      
      // Test 1: Success case
      console.log('Testing successful request logging...');
      const testRequestData = {
        method: 'TEST',
        origin: 'https://test.example.com',
        userAgent: 'Test User Agent',
        referer: 'https://test.referer.com',
        action: 'testLogging',
        userEmail: 'test@example.com',
        testParam: 'test value'
      };
      
      const testResponseData = {
        ok: true,
        message: 'Test successful response',
        timestamp: new Date().toISOString()
      };
      
      logRequest('TEST', testRequestData, testResponseData);
      console.log('✅ Success case logged');
      
      // Test 2: Error case
      console.log('Testing error request logging...');
      const testErrorData = {
        ok: false,
        message: 'Test error response'
      };
      
      logRequest('TEST', testRequestData, testErrorData, 'Test error message');
      console.log('✅ Error case logged');
      
      // Test 3: Check if sheet exists and is accessible
      const debugSheet = SpreadsheetApp.openById(config.DEBUG_SPREADSHEET_ID).getSheets()[0];
      const lastRow = debugSheet.getLastRow();
      console.log(`✅ Debug sheet accessible. Current row count: ${lastRow}`);
      
      const result = {
        success: true,
        message: 'Logging test completed successfully',
        debugSpreadsheetId: config.DEBUG_SPREADSHEET_ID,
        rowsInSheet: lastRow,
        timestamp: new Date().toISOString()
      };
      
      console.log('=== TEST COMPLETED SUCCESSFULLY ===');
      console.log('Result:', result);
      return result;
      
    } catch (error) {
      const errorResult = {
        success: false,
        error: error.toString(),
        message: 'Logging test failed',
        timestamp: new Date().toISOString()
      };
      
      console.error('=== TEST FAILED ===');
      console.error('Error:', error);
      return errorResult;
    }
  }
  
  function createCorsResponse(data) {
    const output = ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
    
    // Note: Google Apps Script doesn't support setHeaders() method
    // CORS headers must be handled differently or may not be fully supported
    // The web app deployment settings handle most CORS requirements
    
    return output;
  }
  
  function doGet(e) {
    const requestData = {
      method: 'GET',
      parameters: e.parameter || {},
      headers: e.headers || {},
      origin: e.parameter?.origin || (e.headers ? e.headers['origin'] : 'Unknown'),
      userAgent: e.headers?.['user-agent'] || e.headers?.['User-Agent'] || 'Unknown',
      referer: e.headers?.['referer'] || e.headers?.['Referer'] || 'Unknown',
      action: 'doGet',
      queryString: e.queryString || 'None',
      contentLength: e.contentLength || 0
    };
    
    const response = {
      ok: true,
      message: "Heymarket Broadcast Export API is running",
      version: "CORS_ENABLED_v2",
      timestamp: new Date().toISOString(),
      methods: ["GET", "POST", "OPTIONS"],
      endpoints: ["verifyAccess", "getSheetNames", "getSheetContent", "saveData", "appendData", "getFilteredData", "getBulkData", "initSession"]
    };
    
    logRequest('GET', requestData, response);
    
    return createCorsResponse(response);
  }
  
  function doOptions() {
    return createCorsResponse({});
  }
  
  function doPost(e) {
    let requestData = {
      method: 'POST',
      parameters: e.parameter || {},
      headers: e.headers || {},
      origin: e.parameter?.origin || (e.headers ? e.headers['origin'] : 'Unknown'),
      userAgent: e.headers?.['user-agent'] || e.headers?.['User-Agent'] || 'Unknown',
      referer: e.headers?.['referer'] || e.headers?.['Referer'] || 'Unknown',
      postData: e.postData || {},
      action: 'Unknown',
      userEmail: 'Unknown',
      queryString: e.queryString || 'None',
      contentLength: e.contentLength || 0
    };
    
    try {
      // Get configuration first
      const config = getConfig();
      
      // Validate origin if ALLOWED_ORIGINS is configured
      if (config.ALLOWED_ORIGINS && config.ALLOWED_ORIGINS.length > 0) {
        // Get the origin from the request headers (this comes from the browser's fetch request)
        const origin = e.parameter ? e.parameter.origin : null;
        if (!isOriginAllowed(origin, config.ALLOWED_ORIGINS)) {
          return createCorsResponse({ ok: false, error: "Origin not allowed" });
        }
      }
      
      // Parse the incoming request body as JSON
      const req = JSON.parse(e.postData.contents || "{}");
      
      // Update request data with parsed info
      requestData.action = req.action || 'Unknown';
      requestData.hasToken = !!req.userToken;
  
      // Validate OAuth token and get user info
      console.log('Received request with action:', req.action);
      console.log('Token present:', !!req.userToken);
      
      const userInfo = validateUserToken(req.userToken);
      if (!userInfo) {
        console.error('Token validation failed');
        const errorResponse = { ok: false, error: "Invalid or expired token" };
        logRequest('POST', requestData, errorResponse, 'Token validation failed');
        return createCorsResponse(errorResponse);
      }
      
      requestData.userEmail = userInfo.email;
      console.log('User authenticated:', userInfo.email);
  
      // Validate required configuration with detailed debugging
      console.log('Config check:', {
        hasBroadcastId: !!config.SPREADSHEET_IDS.BROADCAST,
        broadcastId: config.SPREADSHEET_IDS.BROADCAST
      });

      if (!config.SPREADSHEET_IDS.BROADCAST) {
        return createCorsResponse({
          ok: false,
          error: "Server configuration incomplete - broadcast spreadsheet ID not set",
          debug: {
            hasBroadcastId: !!config.SPREADSHEET_IDS.BROADCAST,
            hasAllowedOrigins: config.ALLOWED_ORIGINS?.length > 0
          }
        });
      }
  
      let result;
  
      switch (req.action) {
        case "verifyAccess":
          // Simplified: Only check broadcast spreadsheet access since that's the only feature
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            result = { ok: true, message: "Access verified", user: { email: userInfo.email, name: userInfo.name } };
          }
          break;

        case "getSheetNames":
          // Simplified: Only check broadcast spreadsheet access
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            result = { ok: true, sheetNames: getSheetNames(config) };
          }
          break;

        case "getSheetContent":
          // Simplified: Only check broadcast spreadsheet access
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            result = getSheetContent(req.sheetName, config);
          }
          break;

        case "saveData":
          // Simplified: Only check broadcast spreadsheet access
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            result = saveData(req.sheetName, req.data, config);
          }
          break;
  
        case "appendData":
          // Simplified: Only check broadcast spreadsheet access since that's the only feature
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            result = appendData(req.values, req.sheetDate, config);
          }
          break;

        case "getFilteredData":
          // Simplified: Only check broadcast spreadsheet access
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            result = getFilteredData(req.sheetName, req.filters, req.page, req.pageSize, config);
          }
          break;

        case "getBulkData":
          // Simplified: Only check broadcast spreadsheet access
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            result = getBulkData(req.sheetNames, req.filters, req.pageSize, config);
          }
          break;

        case "initSession":
          // Combined endpoint for both access verification and sheet fetching
          if (!hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST)) {
            result = { ok: false, error: "Access denied to broadcast spreadsheet" };
          } else {
            // Get both access verification and sheet names in one call
            const sheetNames = getSheetNames(config);
            result = {
              ok: true,
              message: "Access verified",
              user: { email: userInfo.email, name: userInfo.name },
              sheetNames: sheetNames,
              totalSheets: sheetNames.length
            };
          }
          break;

        default:
          result = { ok: false, error: "Unknown action" };
      }
  
      // Add version info to confirm new code is running
      result.version = "CORS_ENABLED_v2";
      result.timestamp = new Date().toISOString();
      
      // Log successful request
      logRequest('POST', requestData, result);
      
      return createCorsResponse(result);
  
    } catch (err) {
      console.error('doPost error:', err.toString());
      const errorResponse = { ok: false, error: err.message };
      logRequest('POST', requestData, errorResponse, err.toString());
      return createCorsResponse(errorResponse);
    }
  }
  
  function isOriginAllowed(origin, allowedOrigins) {
    if (!origin || !allowedOrigins || allowedOrigins.length === 0) {
      return true; // If no origin filtering is configured, allow all
    }
    
    // Normalize the origin (remove trailing slashes)
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    for (const allowedPattern of allowedOrigins) {
      // Normalize the pattern
      const normalizedPattern = allowedPattern.replace(/\/$/, '');
      
      // Handle wildcard patterns
      if (normalizedPattern.includes('*')) {
        // Convert glob pattern to regex
        const regexPattern = normalizedPattern
          .replace(/\./g, '\\.')  // Escape dots
          .replace(/\*/g, '.*');  // Convert * to .*
        
        const regex = new RegExp('^' + regexPattern + '$', 'i');
        if (regex.test(normalizedOrigin)) {
          return true;
        }
      } else {
        // Exact match (case insensitive)
        if (normalizedOrigin.toLowerCase() === normalizedPattern.toLowerCase()) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  function validateUserToken(token) {
    if (!token) {
      console.error('No token provided');
      return null;
    }
    
    try {
      console.log('Validating token with Google...');
      // Verify the JWT token with Google
      const response = UrlFetchApp.fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
      
      console.log('Google token validation response code:', response.getResponseCode());
      
      if (response.getResponseCode() !== 200) {
        console.error('Google token validation failed with response code:', response.getResponseCode());
        console.error('Response content:', response.getContentText());
        return null;
      }
      
      const tokenInfo = JSON.parse(response.getContentText());
      console.log('Token validation successful for email:', tokenInfo.email);
      
      // Verify the audience matches your client ID (optional but recommended)
      const expectedClientId = '221842260905-nidbveovs3vjft1oc42rf4a3aeamdafo.apps.googleusercontent.com';
      if (tokenInfo.aud && tokenInfo.aud !== expectedClientId) {
        console.error('Token audience mismatch. Expected:', expectedClientId, 'Got:', tokenInfo.aud);
        return null;
      }
      
      return {
        email: tokenInfo.email,
        name: tokenInfo.name,
        picture: tokenInfo.picture,
        verified: tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true
      };
    } catch (error) {
      console.error('Token validation error:', error.toString());
      return null;
    }
  }
  
  function verifyUserAccess(userInfo, config) {
    try {
      console.log('Verifying access for user:', userInfo.email);
      console.log('Broadcast spreadsheet ID:', config.SPREADSHEET_IDS.BROADCAST);

      // TEMPORARY: Allow shawn@sweetmephotography.com to bypass access checks for debugging
      if (userInfo.email === 'shawn@sweetmephotography.com') {
        console.log('BYPASSING access checks for debugging purposes');
        return {
          ok: true,
          message: "Access verified (debug bypass)",
          user: {
            email: userInfo.email,
            name: userInfo.name
          }
        };
      }

      // Simplified: Only check if user has access to the broadcast spreadsheet
      const hasSpreadsheetAccess = hasFileAccess(userInfo.email, config.SPREADSHEET_IDS.BROADCAST);
      console.log('Broadcast spreadsheet access:', hasSpreadsheetAccess);

      if (!hasSpreadsheetAccess) {
        return {
          ok: false,
          error: "Access denied - user not authorized for broadcast spreadsheet",
          debug: {
            userEmail: userInfo.email,
            spreadsheetId: config.SPREADSHEET_IDS.BROADCAST,
            hasSpreadsheetAccess: false
          }
        };
      }

      return {
        ok: true,
        message: "Access verified",
        user: {
          email: userInfo.email,
          name: userInfo.name
        }
      };
    } catch (error) {
      console.error('Error in verifyUserAccess:', error);
      return {
        ok: false,
        error: "Error verifying access: " + error.message,
        debug: {
          userEmail: userInfo.email,
          errorMessage: error.message
        }
      };
    }
  }
  
  function hasFileAccess(userEmail, fileId) {
    try {
      console.log(`Checking access for ${userEmail} to file ${fileId}`);
      
      // Try to access the file to check permissions
      const file = DriveApp.getFileById(fileId);
      const viewers = file.getViewers();
      const editors = file.getEditors();
      const owner = file.getOwner();
      
      console.log(`File owner: ${owner ? owner.getEmail() : 'No owner'}`);
      console.log(`File viewers: ${viewers.map(v => v.getEmail()).join(', ')}`);
      console.log(`File editors: ${editors.map(e => e.getEmail()).join(', ')}`);
      
      // Check if user has any level of access
      const ownerEmail = owner ? owner.getEmail() : null;
      const isOwner = owner && owner.getEmail() === userEmail;
      const isViewer = viewers.some(viewer => viewer.getEmail() === userEmail);
      const isEditor = editors.some(editor => editor.getEmail() === userEmail);
      
      console.log(`Email comparison - Looking for: "${userEmail}", Owner: "${ownerEmail}", Match: ${ownerEmail === userEmail}`);
      console.log(`Access check results - Owner: ${isOwner}, Viewer: ${isViewer}, Editor: ${isEditor}`);
      
      const hasAccess = isOwner || isViewer || isEditor;
      console.log(`Final access result: ${hasAccess}`);
      
      return hasAccess;
    } catch (error) {
      // If we can't access the file at all, the current script runner doesn't have access
      // This might happen if the script is running under a different account
      console.error(`Error checking access for file ${fileId}:`, error.toString());
      return false;
    }
  }
  
  function getSheetNames(config) {
    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_IDS.BROADCAST);
    const sheets = spreadsheet.getSheets();
    // Optional: filter only date-formatted names like "YYYY-MM-DD"
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return sheets.map(s => s.getName()).filter(name => regex.test(name));
  }
  
  function getSheetContent(sheetName, config) {
    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_IDS.BROADCAST);
    const sheet = spreadsheet.getSheetByName(sheetName);
  
    if (!sheet) {
      return { ok: false, error: "Sheet not found: " + sheetName };
    }
  
    const values = sheet.getDataRange().getValues(); // 2D array
    return { ok: true, data: values };
  }
  
  function saveData(sheetName, data, config) {
    try {
      const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_IDS.BROADCAST);
      
      // Check if sheet exists, if not create it
      let sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(sheetName, 0);
      } else {
        // Clear existing content
        sheet.clear();
      }
      
      // Validate data is array
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, error: "Invalid data format - expected non-empty array" };
      }
      
      // Write data to sheet
      const range = sheet.getRange(1, 1, data.length, data[0].length);
      range.setValues(data);
      
      return { 
        ok: true, 
        message: `Successfully saved ${data.length} rows to sheet '${sheetName}'`,
        rowsWritten: data.length
      };
      
    } catch (error) {
      return { ok: false, error: "Failed to save data: " + error.message };
    }
  }
  
  function appendData(values, sheetDate, config) {
    try {
      const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_IDS.BROADCAST);
      
      // Use provided sheet date or fall back to today's date
      const today = new Date();
      const sheetName = sheetDate || today.toISOString().slice(0, 10);
      
      // Check if sheet exists
      let sheet = spreadsheet.getSheetByName(sheetName);
      if (sheet) {
        // Clear existing content to overwrite
        sheet.clear();
      } else {
        // Create new sheet at position 0 (first position)
        sheet = spreadsheet.insertSheet(sheetName, 0);
      }
      
      // Validate values is array
      if (!Array.isArray(values) || values.length === 0) {
        return { ok: false, error: "Invalid values format - expected non-empty array" };
      }
      
      // Write data to sheet
      const range = sheet.getRange(1, 1, values.length, values[0].length);
      range.setValues(values);
      
      return { 
        ok: true, 
        message: `Successfully created sheet '${sheetName}' with ${values.length} rows`,
        sheetName: sheetName,
        rowsWritten: values.length
      };
      
    } catch (error) {
      return { ok: false, error: "Failed to append data: " + error.message };
    }
  }

  /**
   * Enhanced data retrieval method with filtering and pagination
   * Better suited for broadcast report data with large datasets
   */
  function getFilteredData(sheetName, filters, page, pageSize, config) {
    try {
      const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_IDS.BROADCAST);
      const sheet = spreadsheet.getSheetByName(sheetName);

      if (!sheet) {
        return { ok: false, error: "Sheet not found: " + sheetName };
      }

      // Get all data from the sheet
      const allData = sheet.getDataRange().getValues();
      if (allData.length === 0) {
        return { ok: true, data: [], totalRows: 0, totalPages: 0, currentPage: 1 };
      }

      // Extract headers from first row
      const headers = allData[0];
      const dataRows = allData.slice(1);

      // Apply filters if provided
      let filteredRows = dataRows;
      if (filters && typeof filters === 'object') {
        filteredRows = dataRows.filter(row => {
          return Object.entries(filters).every(([columnName, filterValue]) => {
            // Find column index by name
            const columnIndex = headers.findIndex(header =>
              header.toString().toLowerCase() === columnName.toLowerCase()
            );

            if (columnIndex === -1) return true; // Column not found, skip filter

            const cellValue = row[columnIndex];
            if (!cellValue) return false;

            const cellStr = cellValue.toString().toLowerCase();
            const filterStr = filterValue.toString().toLowerCase();

            // Simple contains filter - can be enhanced for more complex filtering
            return cellStr.includes(filterStr);
          });
        });
      }

      const totalRows = filteredRows.length;
      const totalPages = pageSize ? Math.ceil(totalRows / pageSize) : 1;

      // Apply pagination if requested
      let paginatedRows = filteredRows;
      let currentPage = 1;

      if (pageSize && page) {
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, filteredRows.length);
        paginatedRows = filteredRows.slice(startIndex, endIndex);
        currentPage = page;
      }

      // Convert back to 2D array format with headers
      const resultData = [headers, ...paginatedRows];

      return {
        ok: true,
        data: resultData,
        totalRows: totalRows,
        totalPages: totalPages,
        currentPage: currentPage,
        pageSize: pageSize || totalRows,
        hasMore: pageSize ? (currentPage * pageSize) < totalRows : false,
        filters: filters || {},
        sheetName: sheetName
      };

    } catch (error) {
      return { ok: false, error: "Failed to get filtered data: " + error.message };
    }
  }

  /**
   * Bulk data retrieval method - fetches multiple sheets in a single request
   * Much more efficient than making individual requests for each sheet
   */
  function getBulkData(sheetNames, filters, pageSize, config) {
    try {
      const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_IDS.BROADCAST);
      const allData = [];
      let totalRecords = 0;
      const results = [];

      console.log(`Bulk fetching ${sheetNames.length} sheets:`, sheetNames);

      // Process each sheet
      for (let i = 0; i < sheetNames.length; i++) {
        const sheetName = sheetNames[i];
        console.log(`Processing sheet ${i + 1}/${sheetNames.length}: ${sheetName}`);

        try {
          const sheet = spreadsheet.getSheetByName(sheetName);
          if (!sheet) {
            console.warn(`Sheet not found: ${sheetName}`);
            continue;
          }

          // Get all data from the sheet
          const sheetData = sheet.getDataRange().getValues();
          if (sheetData.length === 0) {
            console.warn(`Sheet ${sheetName} is empty`);
            continue;
          }

          // Extract headers from first row
          const headers = sheetData[0];
          const dataRows = sheetData.slice(1);

          // Apply filters if provided
          let filteredRows = dataRows;
          if (filters && typeof filters === 'object') {
            filteredRows = dataRows.filter(row => {
              return Object.entries(filters).every(([columnName, filterValue]) => {
                // Find column index by name
                const columnIndex = headers.findIndex(header =>
                  header.toString().toLowerCase() === columnName.toLowerCase()
                );

                if (columnIndex === -1) return true; // Column not found, skip filter

                const cellValue = row[columnIndex];
                if (!cellValue) return false;

                const cellStr = cellValue.toString().toLowerCase();
                const filterStr = filterValue.toString().toLowerCase();

                return cellStr.includes(filterStr);
              });
            });
          }

          // Apply pagination if pageSize is specified
          let paginatedRows = filteredRows;
          if (pageSize && filteredRows.length > pageSize) {
            paginatedRows = filteredRows.slice(0, pageSize);
          }

          // Add sheet metadata and combine with data
          const enrichedRows = paginatedRows.map(row => [
            ...row,
            sheetName, // _sheetName
            sheetName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || sheetName // _sheetDate
          ]);

          // Add headers only once (for the first sheet)
          if (i === 0) {
            allData.push([
              ...headers,
              '_sheetName',
              '_sheetDate'
            ]);
          }

          // Add the data rows
          allData.push(...enrichedRows);

          const sheetRecords = filteredRows.length;
          totalRecords += sheetRecords;

          results.push({
            sheetName: sheetName,
            totalRecords: sheetRecords,
            filteredRecords: paginatedRows.length,
            status: 'success'
          });

          console.log(`Sheet ${sheetName}: ${sheetRecords} total, ${paginatedRows.length} included`);

        } catch (sheetError) {
          console.error(`Error processing sheet ${sheetName}:`, sheetError);
          results.push({
            sheetName: sheetName,
            error: sheetError.toString(),
            status: 'error'
          });
        }
      }

      return {
        ok: true,
        data: allData,
        totalRecords: totalRecords,
        totalSheets: sheetNames.length,
        successfulSheets: results.filter(r => r.status === 'success').length,
        sheetResults: results,
        filters: filters || {},
        pageSize: pageSize,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return { ok: false, error: "Failed to get bulk data: " + error.message };
    }
  }
  