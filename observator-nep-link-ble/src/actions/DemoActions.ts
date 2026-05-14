import { Dispatch } from 'redux';

interface SetDemoModeEnabledAction {
  type: 'DEMO_SET_DEMO_MODE_ENABLED';
  meta: { enabled: boolean };
}

export type DemoAction = SetDemoModeEnabledAction;

export const setDemoModeEnabled = (enabled: boolean) => {
  return (dispatch: Dispatch<DemoAction>) => {
    dispatch({
      type: 'DEMO_SET_DEMO_MODE_ENABLED',
      meta: { enabled },
    });
  };
};
