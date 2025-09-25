# OAuth Authentication Setup Guide

This guide explains how to set up OAuth authentication for the SMP Broadcast Reports application.

## Overview

The authentication system uses Google OAuth to secure access to the application. It has two levels of permission checking:

1. **Application Access Control**: A dummy Google Sheets file that determines who can use the application
2. **Data File Access Control**: The actual spreadsheet containing the data - users must have access to this file to view/modify data

## Setup Steps

### 1. Google Cloud Console Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API and Google Drive API
4. Go to "Credentials" and create an OAuth 2.0 Client ID
5. Set the authorized JavaScript origins (e.g., your domain where the HTML file is hosted)
6. Copy the Client ID - you'll need this for the frontend

### 2. Google Apps Script Setup

1. Open Google Apps Script (script.google.com)
2. Create a new project and paste the contents of `code.gs`
3. Set up Script Properties:
   - Go to Project Settings → Script Properties
   - Add `SPREADSHEET_IDS` with a JSON object containing your spreadsheet IDs
   - Add `ACCESS_CONTROL_FILE_ID` with the ID of your access control file
   - (Optional) Add `ALLOWED_ORIGINS` with a JSON array of allowed origins for additional security

   Example `SPREADSHEET_IDS` value:
   ```json
   {
     "BROADCAST": "your_broadcast_spreadsheet_id_here"
   }
   ```
4. Deploy the script as a web app:
   - Click Deploy → New Deployment
   - Choose "Web app" as type
   - Set execute as "Me" and access to "Anyone"
   - Copy the web app URL

### 3. Access Control File Setup

1. Create a new Google Sheets file (this will be your access control file)
2. Share this file with users who should have access to the application
3. Copy the file ID from the URL
4. Add the file ID to your Google Apps Script's Script Properties as `ACCESS_CONTROL_FILE_ID`

### 4. Frontend Configuration

1. Update `index.html`:
   - Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID
   - Update `Google_Script_ID` with your Apps Script deployment ID

### 5. Data Spreadsheet Setup

1. The spreadsheet containing your actual data should be shared with users who need access
2. Users must have at least "Viewer" access to read data
3. Users need "Editor" access to modify data

## How It Works

### Authentication Flow

1. User visits the web application
2. User clicks "Sign in with Google"
3. Google OAuth popup appears
4. User authenticates and grants permissions
5. Application receives OAuth token
6. Application sends token to Google Apps Script
7. Script validates token with Google
8. Script checks if user has access to:
   - Access control file (application access)
   - Data spreadsheet (data access)
9. If both checks pass, user gains access

### Permission Levels

- **No Access**: User cannot sign in or access any features
- **Application Access Only**: User can sign in but cannot access data (if they don't have access to the data spreadsheet)
- **Full Access**: User can sign in and access all features (has access to both access control file and data spreadsheet)

## Security Features

1. **OAuth Token Validation**: All tokens are validated with Google's servers
2. **File-Level Permissions**: Uses Google Drive's native permission system
3. **No Hardcoded Credentials**: No passwords or secrets stored in client-side code
4. **User-Specific Access**: Each user's permissions are checked individually
5. **Dual Permission Check**: Both application access and data access are verified
6. **Origin Filtering**: Optional whitelist of allowed domains/origins

## Origin Filtering (Optional Security Feature)

You can optionally restrict which domains/origins can access your API by setting the `ALLOWED_ORIGINS` Script Property.

### Setting Up Origin Filtering

1. In Google Apps Script → Project Settings → Script Properties
2. Add property key: `ALLOWED_ORIGINS`
3. Set the value as a JSON array of allowed origins:

```json
[
  "https://galygious.github.io",
  "https://*.sweetmephotography.com",
  "http://localhost:3000"
]
```

### Origin Pattern Examples

- **Exact match**: `"https://galygious.github.io"`
- **Wildcard subdomain**: `"https://*.sweetmephotography.com"`
- **Wildcard path**: `"https://example.com/*"`
- **Local development**: `"http://localhost:3000"`

### How It Works

- **CORS Origins**: Include only the base URL (protocol + domain + port)
  - ✅ `https://galygious.github.io` (this is what gets sent)
  - ❌ `https://galygious.github.io/SMP_Broadcast_Reports_Test/index.html` (path not included)
- **Pattern Matching**: Supports wildcards (`*`) for flexible matching
- **Case Insensitive**: Origin matching is case-insensitive
- **Fallback**: If `ALLOWED_ORIGINS` is not set, all origins are allowed

### Example Configuration

```json
[
  "https://galygious.github.io",
  "https://*.sweetmephotography.com",
  "https://staging.*.com",
  "http://localhost:*"
]
```

This would allow:
- `https://galygious.github.io`
- `https://www.sweetmephotography.com`
- `https://app.sweetmephotography.com`
- `https://staging.mysite.com`
- `http://localhost:3000`
- `http://localhost:8080`

## Expandability

The `SPREADSHEET_IDS` structure allows for easy expansion in the future. You can add more spreadsheets like:

```json
{
  "BROADCAST": "1abc...def",
  "ANALYTICS": "2ghi...jkl", 
  "CUSTOMERS": "3mno...pqr"
}
```

Each spreadsheet can have different access controls and be used for different purposes within the same application.

### Backward Compatibility

The system maintains backward compatibility with the old `SPREADSHEET_ID` property. If you have an existing setup with `SPREADSHEET_ID`, it will automatically be mapped to `SPREADSHEET_IDS.BROADCAST`.

## Troubleshooting

### Common Issues

1. **"Invalid Client ID"**: Check that the Client ID in `index.html` matches your Google Cloud Console
2. **"Access Denied"**: User doesn't have access to the access control file or data spreadsheet
3. **"Token Validation Failed"**: Check that the Google APIs are enabled in your project
4. **CORS Errors**: Ensure your domain is listed in authorized JavaScript origins

### Testing Access

1. Share the access control file with test users
2. Share the data spreadsheet with test users (if they need data access)
3. Have users test the sign-in flow
4. Check the browser console for detailed error messages

## File Structure

- `index.html`: Frontend with OAuth authentication
- `code.gs`: Google Apps Script backend with permission validation
- `ACCESS_CONTROL_FILE_ID`: Google Sheets file ID for application access control
- `SPREADSHEET_ID`: Google Sheets file ID containing the actual data

## Maintenance

- Regularly review who has access to the access control file
- Monitor Google Apps Script execution logs for authentication attempts
- Update Client ID if you change Google Cloud projects
- Backup your access control file and data spreadsheet regularly
