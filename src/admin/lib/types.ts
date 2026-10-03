export interface Site {
  id: string;
  name: string;
  domain: string;
  site_key: string;
  client_name: string | null;
  client_emails: string[];
  email_language: 'sr' | 'en';
  timezone: string;
  notify_owner: boolean;
  active: boolean;
  created_at: string;
}

export type LeadStatus = 'new' | 'contacted' | 'won' | 'lost';

export interface Lead {
  id: string;
  site_id: string;
  form_name: string;
  page_url: string | null;
  data: Record<string, string>;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  user_agent: string | null;
  is_spam: boolean;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
}

export interface EmailLog {
  id: number;
  lead_id: string;
  recipient: string;
  kind: 'client' | 'owner';
  status: 'sent' | 'failed';
  provider_id: string | null;
  error: string | null;
  created_at: string;
}
