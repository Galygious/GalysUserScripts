# CSV Email Sender

A Tampermonkey userscript for automatically sending templated emails to contacts from a CSV file on Pixifi.com.

## Features

- Upload CSV files with contact information
- **Brand-based template selection** using BRAND column from CSV (BOOKING, SCHEDULE, RESERVE, SESSIONS, N/A)
- Automatic template selection based on CSV brand values
- **Configurable template IDs and brand IDs** through built-in settings panel
- Custom subject and message support with placeholder variables
- Batch processing with controlled concurrency
- Real-time progress tracking and results display
- Minimizable UI that stays out of the way
- Persistent configuration storage

## CSV Format Requirements

Your CSV file must have the following columns (case-insensitive, with flexible naming):

- `Phone` - Contact phone number
- `Name` - Contact name
- `EventName` or `Event Name` - Name of the event
- `Event Link` - Link to the event
- `DueDate` or `Due Date` - Due date for the event
- `Email Address` or `Email` - Contact email address
- `Location` - Event location
- `BRAND` - Brand type (BOOKING, SCHEDULE, RESERVE, SESSIONS, or N/A)

### Example CSV:
```csv
Phone,Name,EventName,Event Link,DueDate,Email Address,Location,BRAND
555-1234,John Doe,Wedding Photography,https://example.com/event1,2024-01-15,john@example.com,New York,BOOKING
555-5678,Jane Smith,Portrait Session,https://example.com/event2,2024-01-20,jane@example.com,Los Angeles,SESSIONS
```

## Installation

1. Install Tampermonkey browser extension
2. Create a new script
3. Copy and paste the contents of `CSV Email Sender.user.js`
4. Save the script
5. Navigate to any Pixifi.com leads page to activate the script

## Usage

1. **Navigate to Pixifi**: Go to any leads page on Pixifi.com (e.g., `https://www.pixifi.com/admin/leads/`)

2. **Upload CSV**: 
   - Click "Choose File" and select your CSV file
   - Click "Upload & Preview CSV" to load and preview the data

3. **Brand-Based Templates**: The script uses the BRAND column from your CSV to select templates:
   - **BOOKING** - Uses BOOKING template and brand ID
   - **SCHEDULE** - Uses SCHEDULE template and brand ID
   - **RESERVE** - Uses RESERVE template and brand ID
   - **SESSIONS** - Uses SESSIONS template and brand ID
   - **N/A** - Uses default template and brand ID

4. **Configuration**: Click the "⚙️ Configuration" button to customize:
   - **Template IDs**: Set different template IDs for each brand
   - **Brand IDs**: Configure brand-specific IDs for email sending
   - **Concurrency**: Adjust how many emails to send simultaneously (1-10)
   - **Client ID**: Set your Pixifi client ID
   - Settings are automatically saved and persist between sessions

4. **Customize (Optional)**:
   - **Custom Subject**: Override the template subject
   - **Custom Message**: Override the template message with placeholders:
     - `{{name}}` - Contact name
     - `{{eventname}}` - Event name
     - `{{duedate}}` - Formatted due date
     - `{{location}}` - Event location
     - `{{phone}}` - Contact phone
     - `{{event link}}` - Event link

5. **Send Emails**: Click "Send Emails" to start the batch sending process

## Features

### Batch Processing
- Processes emails in batches of 3 to avoid overwhelming the server
- Real-time progress updates
- Detailed success/failure logging

### Error Handling
- Skips contacts without email addresses
- Continues processing even if individual emails fail
- Provides detailed error messages

### UI Features
- Minimizable interface (click the − button)
- Status messages for all operations
- Preview of CSV data before sending
- Detailed results log

## Configuration

The script includes a built-in configuration panel that allows you to customize all settings without editing code. Click the "⚙️ Configuration" button to access:

### Template IDs
Set different template IDs for each brand type. These are the email templates that will be used for each brand.

### Brand IDs  
Configure brand-specific IDs that are used when sending emails. These correspond to your Pixifi brand settings.

### Other Settings
- **Concurrency Limit**: Number of emails to send simultaneously (1-10)
- **Client ID**: Your Pixifi client ID
- **Default Brand**: Brand to use when automatic detection fails (BOOKING, SCHEDULE, RESERVE, SESSIONS, or N/A)

### Default Values
```javascript
const TEMPLATES = {
    'SCHEDULE': 310037,
    'SESSIONS': 310037,
    'BOOKING': 310037,
    'RESERVE': 310037,
    'N/A': 310037, // Default template
};
const BRAND_IDS = {
    'BOOKING': '11473',
    'SCHEDULE': '18826',
    'RESERVE': '19647',
    'SESSIONS': '15793',
    'N/A': '11634', // Default brand
};
```

**Note**: All configuration changes are automatically saved and will persist between browser sessions.

## Safety Features

- **Dry Run Preview**: The preview shows exactly what will be sent
- **Concurrency Control**: Limits simultaneous requests to prevent server overload
- **Validation**: Checks CSV format and required columns before processing
- **Error Recovery**: Continues processing even if individual emails fail

## Troubleshooting

### Common Issues

1. **"Missing required columns" error**
   - Ensure your CSV has all required column headers
   - Check for extra spaces in column names

2. **"No CSV data loaded" error**
   - Make sure your CSV file has at least one data row
   - Check that the file is a valid CSV format

3. **Email sending fails**
   - Verify you're logged into Pixifi.com
   - Check that the template IDs are correct for your account
   - Ensure you have permission to send emails

4. **Script doesn't appear**
   - Make sure you're on a Pixifi.com leads page
   - Check that Tampermonkey is enabled
   - Refresh the page after installing the script

### Getting Help

If you encounter issues:
1. Check the browser console for error messages
2. Verify your CSV format matches the requirements
3. Test with a small CSV file first
4. Ensure you have proper permissions on Pixifi.com

## Security Notes

- The script only works on Pixifi.com domains
- No data is stored locally beyond the current session
- All API calls use the same authentication as your Pixifi session
- CSV data is processed in memory and not saved

## Version History

- **v1.0**: Initial release with CSV upload, template selection, and batch email sending
