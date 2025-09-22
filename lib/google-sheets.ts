// Google Sheets Integration
// This requires setting up Google Sheets API credentials
// Follow these steps:
// 1. Go to Google Cloud Console
// 2. Create a new project or select existing
// 3. Enable Google Sheets API
// 4. Create credentials (Service Account)
// 5. Share your Google Sheet with the service account email
// 6. Add the credentials JSON to your project

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  credentials: {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
  };
}

export interface ReviewRow {
  question_text: string;
  nct_id: string;
  trial_title: string;
  trial_phase: string;
  review_status: string;
  comments: string;
  reviewed_at: string;
  model_grade: string;
  human_grade: string;
}

export async function exportToGoogleSheets(
  reviews: ReviewRow[],
  config: GoogleSheetsConfig,
  sheetName: string = 'Trial Reviews'
): Promise<boolean> {
  try {
    // Create the request body for Google Sheets API
    const requestBody = {
      values: [
        // Header row
        [
          'Question Text',
          'NCT ID',
          'Trial Title',
          'Trial Phase',
          'Review Status',
          'Comments',
          'Reviewed At',
          'Model Grade',
          'Human Grade'
        ],
        // Data rows
        ...reviews.map(review => [
          review.question_text,
          review.nct_id,
          review.trial_title,
          review.trial_phase,
          review.review_status,
          review.comments,
          review.reviewed_at,
          review.model_grade,
          review.human_grade
        ])
      ]
    };

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${sheetName}!A1:I${reviews.length + 1}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAccessToken(config.credentials)}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to export to Google Sheets:', error);
    return false;
  }
}

async function getAccessToken(credentials: GoogleSheetsConfig['credentials']): Promise<string> {
  // Create JWT token
  const header = btoa(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT'
  }));

  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: credentials.token_uri,
    exp: now + 3600,
    iat: now
  }));

  const message = `${header}.${payload}`;

  // In a real implementation, you'd sign this with the private key
  // For now, we'll return a placeholder that would need to be implemented
  // with proper JWT signing

  // This is a simplified version - in production you'd need proper JWT signing
  const tokenResponse = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: message
    })
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get access token');
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Example usage function
export async function setupGoogleSheetsExport(reviews: ReviewRow[]): Promise<void> {
  // This is where you'd configure your Google Sheets credentials
  // For now, this is a placeholder that shows how it would be used

  const config: GoogleSheetsConfig = {
    spreadsheetId: 'YOUR_SPREADSHEET_ID_HERE',
    credentials: {
      type: 'service_account',
      project_id: 'YOUR_PROJECT_ID',
      private_key_id: 'YOUR_PRIVATE_KEY_ID',
      private_key: 'YOUR_PRIVATE_KEY',
      client_email: 'YOUR_CLIENT_EMAIL',
      client_id: 'YOUR_CLIENT_ID',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'YOUR_CERT_URL'
    }
  };

  const success = await exportToGoogleSheets(reviews, config);

  if (success) {
    console.log('Successfully exported to Google Sheets');
  } else {
    console.error('Failed to export to Google Sheets');
  }
}

// Alternative: Export to a simple CSV format that can be uploaded to Google Sheets
export function exportToCSV(reviews: ReviewRow[]): string {
  const headers = [
    'Question Text',
    'NCT ID',
    'Trial Title',
    'Trial Phase',
    'Review Status',
    'Comments',
    'Reviewed At',
    'Model Grade',
    'Human Grade'
  ];

  const rows = reviews.map(review => [
    `"${review.question_text.replace(/"/g, '""')}"`,
    review.nct_id,
    `"${review.trial_title.replace(/"/g, '""')}"`,
    review.trial_phase,
    review.review_status,
    `"${review.comments.replace(/"/g, '""')}"`,
    review.reviewed_at,
    review.model_grade,
    review.human_grade
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}
