import React from 'react';
import { Flight } from '../types';
import { Plane, Clock, ArrowRight } from 'lucide-react';

interface FlightCardProps {
  flight: Flight;
}

export const FlightCard: React.FC<FlightCardProps> = ({ flight }) => {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow mb-4 group cursor-pointer relative overflow-hidden">
      {/* Selection Highlight */}
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Header: Price & Duration */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-bold text-slate-800">
              {flight.currency === 'USD' ? '$' : flight.currency}{flight.totalPrice}
            </span>
            {flight.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                {tag}
              </span>
            ))}
          </div>
          <div className="text-sm text-slate-500 flex items-center gap-1">
            <Clock size={14} />
            {flight.totalDuration} total • {flight.stopoverInfo}
          </div>
        </div>
        <button className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
          Select
        </button>
      </div>

      {/* Visual Route Chain */}
      <div className="relative">
        {flight.legs.map((leg, idx) => (
          <div key={leg.id} className="relative flex pb-8 last:pb-0">
            {/* Connector Line */}
            {idx !== flight.legs.length - 1 && (
              <div className="absolute left-[19px] top-8 bottom-0 w-0.5 bg-slate-200" />
            )}

            {/* Time & Station */}
            <div className="flex flex-col items-center mr-4 min-w-[40px]">
               <div className="w-10 text-xs font-bold text-slate-800 text-right">{leg.departureTime}</div>
               <div className="w-2.5 h-2.5 rounded-full bg-slate-300 border-2 border-white my-1 z-10" />
               <div className="w-10 text-xs text-slate-400 text-right">{leg.origin}</div>
            </div>

            {/* Leg Details */}
            <div className="flex-1 pt-0.5">
               <div className="flex items-center gap-2 text-sm text-slate-700 font-medium mb-1">
                  <Plane size={14} className="text-blue-500 transform rotate-90" />
                  {leg.carrier}
               </div>
               <div className="text-xs text-slate-400">
                  Flight {leg.flightNumber} • {leg.duration}
               </div>
               
               {/* Arrival at next stop (Only show if it's the final destination of this leg and we want to show layovers clearly) */}
               <div className="mt-4 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-blue-500" />
                 <span className="text-xs font-bold text-slate-800">{leg.arrivalTime}</span>
                 <span className="text-xs text-slate-500">Arrive {leg.destination}</span>
               </div>
               
               {/* Layover Indicator */}
               {idx < flight.legs.length - 1 && (
                 <div className="mt-3 ml-2 px-3 py-1.5 rounded-md bg-orange-50 text-orange-700 text-xs inline-flex items-center gap-1 border border-orange-100">
                    <Clock size={12} />
                    Layover in {leg.destination}
                 </div>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};