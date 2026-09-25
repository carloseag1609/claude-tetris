---
name: local-weather
description: Fetch current weather and short forecast for a location using free, no-API-key APIs (Geocoding and Open-Meteo). Use whenever user asks about weather, temperature, rain, forecast, or "what's it like outside" for a city or place. Always ask user for the location (city, or "city, country") if not given, then look up coordinates and fetch weather.
---

# Local Weather

Get current weather / forecast for a place using Open-Meteo (free, no key).

## Steps

1. If location not given in request, ask user for city (optionally country/region for disambiguation).
2. Geocode location to lat/lon:
   `https://geocoding-api.open-meteo.com/v1/search?name=<CITY>&count=1&language=en&format=json`
   Use WebFetch. Take first result's `latitude`, `longitude`, `name`, `country`.
3. Fetch weather with those coords:
   `https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`
   Use WebFetch.
4. Report back: place name, current temp (+ feels-like), condition (translate `weather_code` via WMO table below), wind, humidity, and today's high/low + precip chance.

## WMO weather_code reference (common ones)

- 0: Clear sky
- 1-3: Mainly clear / partly cloudy / overcast
- 45, 48: Fog
- 51-57: Drizzle (light-dense)
- 61-67: Rain (light-heavy)
- 71-77: Snow
- 80-82: Rain showers
- 95: Thunderstorm
- 96, 99: Thunderstorm with hail

## Notes

- No API key needed for either endpoint.
- If geocoding returns no results, ask user to clarify location (add country/state).
- Units are metric by default (°C, km/h); pass `&temperature_unit=fahrenheit&wind_speed_unit=mph` if user wants imperial.
