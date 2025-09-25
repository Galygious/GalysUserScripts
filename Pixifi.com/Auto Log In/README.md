# Pixifi Auto Log In

A Tampermonkey user script that automatically logs into the Pixifi admin page using saved credentials.

## Features

- **Automatic Login**: Automatically fills in and submits login credentials when visiting the Pixifi admin login page
- **Post-Login Redirect**: Automatically redirects to the leads page after successful login
- **Secure Credential Storage**: Stores credentials securely using Tampermonkey's built-in storage
- **Easy Management**: Built-in dialog for managing saved credentials
- **Menu Commands**: Quick access to credential management through Tampermonkey menu

## Installation

1. Install the Tampermonkey browser extension if you haven't already
2. Open the `Pixifi Auto Log In.user.js` file in your browser
3. Tampermonkey should detect the script and prompt you to install it
4. Click "Install" to add the script to Tampermonkey

## Usage

### First Time Setup

1. Visit `https://www.pixifi.com/admin/login.php`
2. Right-click on the Tampermonkey icon in your browser toolbar
3. Select "Manage Pixifi Credentials" from the menu
4. Enter your Pixifi username and password
5. Click "Save" to store your credentials

### Automatic Login

Once credentials are saved, the script will automatically:
- Fill in your username and password when you visit the login page
- Submit the form automatically after a short delay
- Log you in without any manual intervention
- Redirect you to the leads page (`https://www.pixifi.com/admin/leads/`) instead of the default admin page

### Managing Credentials

You can manage your saved credentials through the Tampermonkey menu:

- **Manage Pixifi Credentials**: Open the credentials dialog to view, edit, or save new credentials
- **Clear Pixifi Credentials**: Remove all saved credentials from storage

## Security Notes

- Credentials are stored locally in your browser using Tampermonkey's secure storage
- The script only runs on the Pixifi admin login page
- You can clear saved credentials at any time through the menu
- The script includes console logging for debugging purposes

## Troubleshooting

If the auto-login doesn't work:

1. Check the browser console for any error messages
2. Verify that your credentials are saved correctly using the "Manage Pixifi Credentials" menu
3. Make sure you're on the correct login page (`https://www.pixifi.com/admin/login.php`)
4. Try clearing and re-saving your credentials

## Supported URLs

The script works on:
- `https://www.pixifi.com/admin/login.php`
- `https://pixifi.com/admin/login.php`
- `https://www.pixifi.com/admin/` (for post-login redirect)
- `https://pixifi.com/admin/` (for post-login redirect)

## Version History

- **v1.1**: Added post-login redirect to leads page
- **v1.0**: Initial release with automatic login and credential management
