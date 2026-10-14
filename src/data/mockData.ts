import { AppData } from '../types';
import { OFFICIAL_STATIONS } from './officialStations';

export const INITIAL_DATA: AppData = {
  stations: OFFICIAL_STATIONS,
  maintenanceRequests: [],
  inspections: [],
  incidents: []
};
