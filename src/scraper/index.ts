import { getTeamInfo } from './getTeamInfo';
import { getPlayerInfo } from './getPlayerInfo';
import { getTeamMatches } from './getTeamMatches';
import { getMatchInfo } from './getMatchInfo';
import { getMatchScore } from './getMatchScore';
import { getRankingInfo } from './getRankingInfo';
import { search } from './search';
import { getMatches } from './getMatches';
import { getEvents } from './getEvents';
import { getEventInfo } from './getEventInfo';
import { getResults } from './getResults';

export const HLTV_URL = 'https://www.hltv.org';
export const TEAM_PLACEHOLDER_IMAGE = 'https://www.hltv.org/img/static/team/placeholder.svg';
export const PLAYER_PLACEHOLDER_IMAGE = 'https://static.hltv.org/images/playerprofile/bodyshot/unknown.png';

export const Scraper = {
  getTeamInfo,
  getTeamMatches,
  getMatchInfo,
  getMatchScore,
  getRankingInfo,
  search,
  getPlayerInfo,
  getMatches,
  getEvents,
  getEventInfo,
  getResults,
  TEAM_PLACEHOLDER_IMAGE,
  PLAYER_PLACEHOLDER_IMAGE,
};

export default Scraper;
