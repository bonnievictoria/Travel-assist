import { Flight, Leg } from '../types';
import { addHours, format, addDays } from 'date-fns';

const AIRLINES = ['Singapore Airlines', 'Qatar Airways', 'Emirates', 'British Airways', 'ANA', 'Cathay Pacific'];
const CITIES: Record<string, string> = {
  'LHR': 'London', 'SIN': 'Singapore', 'CGK': 'Jakarta',
  'JFK': 'New York', 'HND': 'Tokyo', 'ICN': 'Seoul',
  'SFO': 'San Francisco', 'CDG': 'Paris', 'ATH': 'Athens',
  'DXB': 'Dubai', 'IST': 'Istanbul'
};

const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const mockSearchFlights = (
  origin: string,
  destination: string,
  stops: string[] = [],
  dateStr: string = '2024-05-01'
): Flight[] => {
  const results: Flight[] = [];
  const numResults = 5;

  for (let i = 0; i < numResults; i++) {
    const legs: Leg[] = [];
    let currentOrigin = origin.toUpperCase();
    let currentTime = new Date(dateStr);
    
    // Add some random start time variance
    currentTime = addHours(currentTime, getRandomInt(8, 20)); 

    // Build route: Origin -> Stop1 -> Stop2 -> ... -> Dest
    const route = [currentOrigin, ...stops.map(s => s.toUpperCase()), destination.toUpperCase()];

    let totalPrice = 0;

    for (let j = 0; j < route.length - 1; j++) {
      const legOrigin = route[j];
      const legDest = route[j + 1];
      const durationHours = getRandomInt(6, 14);
      
      const departure = new Date(currentTime);
      const arrival = addHours(departure, durationHours);
      
      legs.push({
        id: `leg-${i}-${j}`,
        origin: legOrigin,
        destination: legDest,
        departureTime: format(departure, "HH:mm"),
        arrivalTime: format(arrival, "HH:mm"),
        duration: `${durationHours}h ${getRandomInt(0, 59)}m`,
        carrier: getRandomElement(AIRLINES),
        flightNumber: `AF${getRandomInt(100, 999)}`
      });

      totalPrice += getRandomInt(300, 800);

      // Layover logic
      if (j < route.length - 2) {
        // If there's a next leg, add layover time
        const layoverHours = getRandomInt(2, 48);
        currentTime = addHours(arrival, layoverHours);
      }
    }

    const totalDurationHours = (new Date(currentTime).getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60);

    results.push({
      id: `flight-${i}`,
      totalPrice: totalPrice,
      currency: 'USD',
      totalDuration: `${Math.floor(totalDurationHours / 24)}d ${Math.floor(totalDurationHours % 24)}h`,
      legs,
      tags: i === 0 ? ['Best Value'] : i === 1 ? ['Fastest'] : [],
      stopoverInfo: stops.length > 0 ? `${stops.length} stop(s)` : 'Direct'
    });
  }

  // Sort by price
  return results.sort((a, b) => a.totalPrice - b.totalPrice);
};