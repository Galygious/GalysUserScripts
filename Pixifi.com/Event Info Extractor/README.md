# Event Info Extractor

A Tampermonkey user script that extracts event information from Pixifi client preview modals and copies it to the clipboard as CSV format.

## Features

- Automatically adds an "Extract Info" button to the Actions section of client preview modals
- Extracts the following information:
  - Phone numbers
  - Client name
  - Event name
  - Event link (current page URL)
  - Due date
  - Email address
  - Location/address
  - Photographer name
  - Newborn photographer name

## Installation

1. Install the Tampermonkey browser extension
2. Create a new script
3. Copy and paste the contents of `Event Info Extractor.user.js`
4. Save the script

## Usage

1. Navigate to an event page on Pixifi (e.g., `https://www.pixifi.com/admin/events/1167140/`)
2. Open the client preview modal (this usually happens automatically when viewing event details)
3. Look for the "Extract Info" button in the Actions section
4. Click the button to extract all information and copy it to your clipboard
5. The data will be copied as a CSV string that you can paste into a spreadsheet

## CSV Format

The extracted data is formatted as a comma-separated string with the following fields:

```
Phone,Name,Event Name,Event Link,Due Date,Email,Location,Zip Code,Photographer,Newborn Photographer
```

## Dependencies

This script works in conjunction with the "Pixifi Calendar Year View" script to access photographer data that has been previously saved to localStorage.

## Troubleshooting

- If the button doesn't appear, refresh the page and try again
- Check the browser console for any error messages
- Ensure you're on a valid event page URL
- The script will automatically retry adding the button for up to 30 seconds

## Notes

- The script uses the browser's clipboard API to copy data
- Photographer information is retrieved from the event's staff listing
- Additional photographer data (first/last names) is pulled from localStorage if available from the Calendar Year View script
- The script includes visual feedback (toast messages) to confirm successful extraction
