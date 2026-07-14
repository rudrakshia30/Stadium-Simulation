/**
 * Simulated transport state factory for Unity Arena.
 * All data is fictional — for demonstration purposes only.
 *
 * @module data/transport
 */

/**
 * Returns the baseline transport state.
 * @returns {Array<Object>}
 */
export function getDefaultTransportState() {
  const base = new Date();
  const next = (mins) => new Date(base.getTime() + mins * 60000).toISOString();

  return [
    {
      id: 'metro-main',
      name: 'Metro Station (Unity Square)',
      type: 'metro',
      status: 'operational',
      nextDeparture: next(4),
      frequency: 6,
      platform: 'Platform 2 — City Centre direction',
      notes: 'Running to schedule. Extra services active for match.',
      lastUpdated: base.toISOString(),
      accessible: true,
    },
    {
      id: 'bus-terminal',
      name: 'Bus Terminal',
      type: 'bus',
      status: 'operational',
      nextDeparture: next(7),
      frequency: 15,
      platform: 'Bays 1–4',
      notes: 'Routes 14, 27, 38 serving city centre. Route 52 serving south suburbs.',
      lastUpdated: base.toISOString(),
      accessible: true,
    },
    {
      id: 'shuttle-east',
      name: 'Shuttle Pickup (East)',
      type: 'shuttle',
      status: 'operational',
      nextDeparture: next(10),
      frequency: 20,
      platform: 'East Car Park Shuttle Bay',
      notes: 'Park-and-ride service. Runs continuously for 2 hours after final whistle.',
      lastUpdated: base.toISOString(),
      accessible: false,
    },
    {
      id: 'taxi-west',
      name: 'Taxi Pickup (West)',
      type: 'taxi',
      status: 'operational',
      nextDeparture: null,
      frequency: null,
      platform: 'West Gate Taxi Bay',
      notes: 'On-demand service. Average wait 8–12 minutes currently.',
      lastUpdated: base.toISOString(),
      accessible: false,
    },
    {
      id: 'accessible-transport',
      name: 'Accessible Transport Hub',
      type: 'accessible_transport',
      status: 'operational',
      nextDeparture: next(5),
      frequency: 15,
      platform: 'Accessible Hub Drop-off',
      notes: 'Wheelchair-accessible vehicles available. Pre-booking recommended.',
      lastUpdated: base.toISOString(),
      accessible: true,
    },
    {
      id: 'bicycle-parking',
      name: 'Bicycle Parking',
      type: 'bicycle',
      status: 'operational',
      nextDeparture: null,
      frequency: null,
      platform: 'West Gate Bicycle Compound',
      notes: '250 secure spaces. 80% capacity currently.',
      lastUpdated: base.toISOString(),
      accessible: true,
    },
  ];
}
