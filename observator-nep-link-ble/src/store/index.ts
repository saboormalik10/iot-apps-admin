import {combineReducers} from 'redux';
import {createStore, applyMiddleware} from 'redux';
import {createLogger} from 'redux-logger';
import {createPromise} from 'redux-promise-middleware';
const thunkMiddleware = require('redux-thunk').thunk;

import demoSlice from './demoSlice';
import devicesSlice from './devicesSlice';
import sensorDataSlice from './sensorDataSlice';
import loggingSlice from './loggingSlice';

const reducers = {
  demo: demoSlice,
  devices: devicesSlice,
  sensorData: sensorDataSlice,
  logging: loggingSlice,
};

const store = createStore(
  combineReducers(reducers),
  applyMiddleware(createPromise(), thunkMiddleware, createLogger()),
);

export default store;
