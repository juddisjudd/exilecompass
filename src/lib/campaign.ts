import act1 from './data/campaign/act1.json';
import act2 from './data/campaign/act2.json';
import act3 from './data/campaign/act3.json';
import act4 from './data/campaign/act4.json';
import act5 from './data/campaign/act5.json';
import act6 from './data/campaign/act6.json';
import interlude1 from './data/campaign/interlude1.json';
import interlude2 from './data/campaign/interlude2.json';
import interlude3 from './data/campaign/interlude3.json';

export interface CampaignObjective {
  id: string;
  text: string;
  optional?: boolean;
  notes?: string[];
  reward?: string;
}

export interface CampaignZone {
  id: string;
  name: string;
  objectives: CampaignObjective[];
}

export interface CampaignAct {
  number: number;
  name: string;
  /** Set to false to hide this act/interlude from the guide without deleting its data. */
  enabled: boolean;
  /** True for temporary interludes that will be replaced by proper acts at 1.0. */
  temporary?: boolean;
  zones: CampaignZone[];
}

const ALL_ACTS = [
  act1, act2, act3, act4,
  interlude1, interlude2, interlude3,
  act5, act6,
] as CampaignAct[];

export const CAMPAIGN_DATA: CampaignAct[] = ALL_ACTS.filter((a) => a.enabled);
