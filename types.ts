export interface Leg {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  carrier: string;
  flightNumber: string;
}

export interface Flight {
  id: string;
  totalPrice: number;
  currency: string;
  totalDuration: string;
  legs: Leg[];
  tags: string[]; // e.g., "Cheapest", "Fastest", "Eco-friendly"
  stopoverInfo?: string; // e.g., "2 nights in Singapore"
}

export interface SearchParams {
  origin: string;
  destination: string;
  date: string;
  stops: string[];
  preferences?: string;
}

export interface ToolResponse {
  flights: Flight[];
  summary: string;
  sources?: { title: string; uri: string }[];
}

export type LiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';