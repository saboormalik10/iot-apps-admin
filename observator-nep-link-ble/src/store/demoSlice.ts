import { DemoAction } from '../actions/DemoActions';

interface DemoState {
  demoModeEnabled: boolean;
}

const initialState: DemoState = {
  demoModeEnabled: false,
};

export default function demoReducer(
  state: DemoState = initialState,
  action: DemoAction
): DemoState {
  switch (action.type) {
    case 'DEMO_SET_DEMO_MODE_ENABLED':
      return { ...state, demoModeEnabled: action.meta.enabled };
    default:
      return state;
  }
}
