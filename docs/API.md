# SignalLoop API Documentation

Base URL: `http://localhost:3000/api` (development)

All API endpoints require authentication unless otherwise noted.

## Authentication

### Google OAuth

**Initiate Login**
```
GET /api/auth/google
```

Redirects to Google OAuth consent screen.

**OAuth Callback**
```
GET /api/auth/google/callback
```

Handles OAuth callback and creates/updates user session.

**Get Current User**
```
GET /api/auth/me
```

Returns currently authenticated user.

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "primaryEmail": "user@example.com",
    "displayName": "John Doe",
    "tenantId": "tenant_123"
  }
}
```

**Logout**
```
POST /api/auth/logout
```

Destroys user session.

## Survey

### Get Survey Prompt

**Endpoint:** `GET /api/survey/prompt`

Checks if user is eligible for a survey and returns the item to display.

**Response (Eligible):**
```json
{
  "showSurvey": true,
  "item": {
    "id": "item_123",
    "text": "I would recommend this organization as a great place to work",
    "scaleType": "LIKERT_5",
    "scaleConfig": {
      "labels": {
        "1": "Strongly Disagree",
        "2": "Disagree",
        "3": "Neutral",
        "4": "Agree",
        "5": "Strongly Agree"
      }
    }
  },
  "campaign": {
    "id": "campaign_123"
  }
}
```

**Response (Not Eligible):**
```json
{
  "showSurvey": false,
  "redirectTo": "/dashboard"
}
```

### Submit Survey Response

**Endpoint:** `POST /api/survey/submit`

**Request Body:**
```json
{
  "itemId": "item_123",
  "value": 4,
  "deliveryContext": "sso_login"
}
```

**Response:**
```json
{
  "success": true,
  "signalId": "signal_123",
  "redirectTo": "/dashboard"
}
```

### Get User's Survey History

**Endpoint:** `GET /api/survey/history`

**Query Parameters:**
- `limit` (number, default: 50)
- `offset` (number, default: 0)

**Response:**
```json
{
  "signals": [
    {
      "id": "signal_123",
      "itemText": "I feel valued for my contributions",
      "value": 4,
      "createdAt": "2024-01-15T10:30:00Z",
      "category": "recognition"
    }
  ],
  "total": 42
}
```

## Admin

### Campaigns

**List Campaigns**
```
GET /api/admin/campaigns
```

**Query Parameters:**
- `status` (string): Filter by status (DRAFT, ACTIVE, PAUSED, COMPLETED)

**Response:**
```json
[
  {
    "id": "campaign_123",
    "name": "Weekly Engagement Pulse",
    "status": "ACTIVE",
    "startDate": "2024-01-01",
    "endDate": null,
    "cadence": "WEEKLY",
    "campaignItems": [...],
    "targetRules": [...]
  }
]
```

**Get Campaign**
```
GET /api/admin/campaigns/:id
```

**Create Campaign**
```
POST /api/admin/campaigns
```

**Request Body:**
```json
{
  "name": "Weekly Engagement Pulse",
  "description": "Continuous engagement monitoring",
  "startDate": "2024-01-01",
  "cadence": "WEEKLY",
  "maxTouchesPerDay": 1,
  "maxTouchesPerWeek": 3,
  "timeWindows": [
    {
      "dayOfWeek": 1,
      "startHour": 9,
      "endHour": 17
    }
  ]
}
```

**Update Campaign**
```
PATCH /api/admin/campaigns/:id
```

### Items

**List Items**
```
GET /api/admin/items
```

**Query Parameters:**
- `signalTypeId` (string)
- `category` (string)
- `status` (string)

**Create Item**
```
POST /api/admin/items
```

**Request Body:**
```json
{
  "signalTypeId": "signal_type_123",
  "text": "I have the resources I need to do my job well",
  "description": "Measures resource availability",
  "scaleType": "LIKERT_5",
  "scaleConfig": {},
  "category": "resources",
  "tags": ["resources", "support"]
}
```

### Target Rules

**List Target Rules**
```
GET /api/admin/target-rules
```

**Create Target Rule**
```
POST /api/admin/target-rules
```

**Request Body:**
```json
{
  "name": "All Teachers",
  "description": "Target all staff with jobFamily = Teacher",
  "expression": {
    "operator": "AND",
    "conditions": [
      {
        "field": "jobFamily",
        "operator": "equals",
        "value": "Teacher"
      }
    ]
  }
}
```

### Campaign Items

**Add Item to Campaign**
```
POST /api/admin/campaigns/:campaignId/items
```

**Request Body:**
```json
{
  "itemId": "item_123",
  "weight": 1,
  "order": 1
}
```

### Signal Types

**List Signal Types**
```
GET /api/admin/signal-types
```

**Response:**
```json
[
  {
    "id": "signal_type_123",
    "name": "EngagementPulse",
    "displayName": "Engagement Pulse",
    "description": "Continuous engagement monitoring",
    "status": "ACTIVE"
  }
]
```

## Reporting

All reporting endpoints enforce confidentiality with minimum-N thresholds.

### Engagement Report

**Endpoint:** `GET /api/reporting/engagement`

**Query Parameters:**
- `startDate` (ISO date)
- `endDate` (ISO date)
- `orgUnitId` (string)
- `jobFamily` (string)
- `region` (string)
- `minN` (number, default: 5)

**Response:**
```json
{
  "totalResponses": 127,
  "meetsMinimumN": true,
  "items": [
    {
      "itemId": "item_123",
      "itemText": "I would recommend this as a great place to work",
      "scaleType": "LIKERT_5",
      "count": 127,
      "meetsMinimumN": true,
      "statistics": {
        "count": 127,
        "mean": 4.2,
        "distribution": {
          "1": 3,
          "2": 5,
          "3": 15,
          "4": 52,
          "5": 52
        },
        "favorablePercent": 82
      }
    }
  ],
  "period": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }
}
```

### Trends

**Endpoint:** `GET /api/reporting/trends`

**Query Parameters:**
- `itemId` (string, optional)
- `startDate` (ISO date)
- `endDate` (ISO date)
- `granularity` (string: "day", "week", "month")
- `orgUnitId` (string, optional)
- `jobFamily` (string, optional)
- `minN` (number, default: 5)

**Response:**
```json
{
  "granularity": "week",
  "data": [
    {
      "period": "2024-W01",
      "count": 45,
      "mean": 4.1,
      "favorablePercent": 78
    },
    {
      "period": "2024-W02",
      "count": 52,
      "mean": 4.3,
      "favorablePercent": 85
    }
  ],
  "meetsMinimumN": true
}
```

### Breakdown

**Endpoint:** `GET /api/reporting/breakdown`

**Query Parameters:**
- `dimension` (string): Field to break down by (e.g., "jobFamily", "region", "orgUnit")
- `itemId` (string, optional)
- `startDate` (ISO date)
- `endDate` (ISO date)
- `minN` (number, default: 5)

**Response:**
```json
{
  "dimension": "jobFamily",
  "breakdown": [
    {
      "dimension": "Teacher",
      "count": 85,
      "meetsMinimumN": true,
      "statistics": {
        "mean": 4.2,
        "favorablePercent": 82
      }
    },
    {
      "dimension": "Administrator",
      "count": 42,
      "meetsMinimumN": true,
      "statistics": {
        "mean": 4.5,
        "favorablePercent": 90
      }
    }
  ],
  "totalGroups": 2
}
```

### Manager Team Report

**Endpoint:** `GET /api/reporting/manager/team`

**Query Parameters:**
- `startDate` (ISO date)
- `endDate` (ISO date)
- `includeIndirect` (boolean, default: false)
- `minN` (number, default: 5)

**Response:**
```json
{
  "teamSize": 12,
  "responseCount": 48,
  "meetsMinimumN": true,
  "statistics": [
    {
      "itemId": "item_123",
      "itemText": "I feel valued for my contributions",
      "mean": 4.3,
      "favorablePercent": 85
    }
  ],
  "period": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }
}
```

### Functional Cohort Report

**Endpoint:** `GET /api/reporting/functional/cohort`

**Query Parameters:**
- `jobFamily` (string, required)
- `startDate` (ISO date)
- `endDate` (ISO date)
- `minN` (number, default: 5)

**Response:**
```json
{
  "cohortSize": 145,
  "responseCount": 420,
  "meetsMinimumN": true,
  "statistics": [...],
  "period": {...}
}
```

### Benchmarks

**Endpoint:** `GET /api/reporting/benchmarks`

**Query Parameters:**
- `scopeType` (string): "team", "orgUnit", "jobFamily"
- `scopeId` (string, optional)
- `itemId` (string, optional)
- `startDate` (ISO date)
- `endDate` (ISO date)
- `minN` (number, default: 5)

**Response:**
```json
{
  "scope": {
    "mean": 4.2,
    "favorablePercent": 82
  },
  "organization": {
    "mean": 4.0,
    "favorablePercent": 75
  },
  "comparison": {
    "meanDifference": 0.2,
    "favorablePercentDifference": 7
  }
}
```

### Export Data

**Endpoint:** `POST /api/reporting/export`

**Request Body:**
```json
{
  "reportType": "engagement",
  "filters": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  },
  "format": "csv"
}
```

**Response:**
CSV file download

**Note:** Export actions are logged in the audit trail.

## Error Responses

All endpoints return consistent error responses:

**400 Bad Request**
```json
{
  "status": "error",
  "message": "Invalid request parameters"
}
```

**401 Unauthorized**
```json
{
  "status": "error",
  "message": "Authentication required"
}
```

**403 Forbidden**
```json
{
  "status": "error",
  "message": "Access denied to this resource"
}
```

**404 Not Found**
```json
{
  "status": "error",
  "message": "Resource not found"
}
```

**500 Internal Server Error**
```json
{
  "status": "error",
  "message": "Internal server error"
}
```

## Rate Limiting

API endpoints are rate-limited:
- **Survey endpoints**: 100 requests per 15 minutes per IP
- **Admin endpoints**: 100 requests per 15 minutes per IP
- **Reporting endpoints**: 100 requests per 15 minutes per IP

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

## Webhooks (Future)

SignalLoop will support webhooks for real-time notifications:

**Event Types:**
- `signal.created` - New survey response
- `campaign.started` - Campaign activated
- `campaign.completed` - Campaign ended
- `snapshot.created` - Daily snapshot completed

**Webhook Payload:**
```json
{
  "event": "signal.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "signalId": "signal_123",
    "userId": "user_123",
    "itemId": "item_123"
  }
}
```
