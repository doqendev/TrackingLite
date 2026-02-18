export interface MetaCapiEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data?: MetaCustomData;
}

export interface MetaUserData {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  ct?: string[];
  st?: string[];
  zp?: string[];
  country?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
  external_id?: string[];
}

export interface MetaCustomData {
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_type?: string;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  content_name?: string;
  content_category?: string;
  num_items?: number;
  order_id?: string;
}

export interface MetaCapiRequestBody {
  data: MetaCapiEvent[];
  test_event_code?: string;
  access_token?: string;
}

export interface MetaCapiResponse {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
}

export interface MetaCapiErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}
