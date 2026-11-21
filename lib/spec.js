export const SPEC = {
  "title": "Lead Enrichment",
  "tagline": "Check a lead before you contact them.",
  "method": "GET",
  "path": "/api/enrich",
  "button": "Enrich",
  "headline": [
    "email.result",
    "email.score",
    "company.name"
  ],
  "fields": [
    {
      "name": "email",
      "label": "Work email",
      "type": "text",
      "placeholder": "jane@acme.com",
      "maxlength": 254
    },
    {
      "name": "domain",
      "label": "Company domain (optional)",
      "type": "text",
      "placeholder": "acme.com",
      "maxlength": 253
    }
  ]
}
