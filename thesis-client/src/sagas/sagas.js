import jwtDecode from 'jwt-decode';
import { Alert } from 'react-native';
import { Location, Permissions } from 'expo';
import Polyline from '@mapbox/polyline';
import { all, call, put, takeEvery, takeLatest, take, fork, cancel } from 'redux-saga/effects';
import { dbPOST, dbSecureGET, dbSecurePOST } from '../utilities/server-calls';
import { storeItem } from '../utilities/async-storage';
import { getRedirectUrl, facebookAuth, googleDirectionsCall, getGoogleRouteImage } from '../utilities/api-calls';
import {
  INITIATE_LOGIN_DEMO,
  INITIATE_LOGIN,
  LOGIN,
  LOGOUT,
  LOGIN_ERROR,
  STORAGE_KEY,
  ENABLE_LOGIN,
  DISABLE_LOGIN,
  CREATE_TRIP,
  CREATE_TRIP_SAVE,
  CREATE_TRIP_SUCCESS,
  CREATE_TRIP_FAILED,
  CREATE_TRIP_CANCELLED,
  RETRIEVED_MAP_IMAGE,
  RETRIEVED_TRIP_DATA,
  demoUser,
  GET_TRIPS_SUCCESS,
  GET_USER_LOCATION_SUCCESS,
  GET_USER_LOCATION_FAILED,
  UPDATE_MAP_REGION,
  UPDATE_ROUTE_COORDS,
  GET_USER_TRIPS_SUCCESS,
  GET_USER_SESSIONS_SUCCESS,
  GET_TRIPS,
  GET_USER_TRIPS,
  GET_USER_SESSIONS,
  GET_DIRECTIONS,
  GET_USER_LOCATION,
  POST_FAVORITE,
  GET_USER_FAVORITES_SUCCESS,
  GET_USER_FAVORITES,
  } from '../constants';
import { googleAPIKEY } from '../../config';

const authorizeUser = function* (params) {
  const redirectUrl = getRedirectUrl;
  try {
    yield put({ type: DISABLE_LOGIN });

    const { type, params: { code, error } } = params.type === INITIATE_LOGIN ? yield call(facebookAuth, redirectUrl) : { type: "success", params: { code: demoUser, error: null } };

    if (type === 'success' && !error) {
      // ! Quick hack to make loader run, probably should fix later
      yield put({ type: ENABLE_LOGIN });
      yield put({ type: DISABLE_LOGIN });
      const {
        type: apiType,
        id_token,
        access_token,
      } = yield call(dbPOST, '/authorize', { code, redirectUrl });

      if (apiType === 'success!') {

        const user = jwtDecode(id_token);
        yield all([
          yield put({ type: LOGIN, user }),
          yield call(storeItem, STORAGE_KEY, access_token),
          yield put({ type: ENABLE_LOGIN }),
        ]);

      } else {
        throw new Error('Database call failed', type);
      }
    } else {
      throw new Error('Facebook login failed', type);
    }

  } catch (error) {
    console.log('error', error);
    Alert.alert('Cancelled');
    yield all([
        yield put({ type: LOGIN_ERROR, error }),
        yield put({ type: ENABLE_LOGIN }),
    ]);
  }
};

const getTripsAsync = function* () {
  try {
    const tripsRequest = yield call(dbSecureGET, 'route');

    // yield put({ type: GET_TRIPS_SUCCESS, payload: tripsRequest });
  } catch (error) {
    console.log('async', JSON.stringify(error));
  }
};

const getUserLocationAsync = function* () {
  try {
    const { status } = yield call(Permissions.askAsync, Permissions.LOCATION);
    if (status !== 'granted') {
      yield put({ type: GET_USER_LOCATION_FAILED, payload: 'Permission to access location was denied' });
    }
    const userLocation = yield call(Location.getCurrentPositionAsync, {});
    yield put({
      type: UPDATE_MAP_REGION,
      payload: {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
        },
    });
    yield put({ type: GET_USER_LOCATION_SUCCESS, payload: userLocation });
  } catch (error) {
    console.log(error);
  }
};

const getUserDirectionsAsync = function* ({ payload: { origin, destination, joinedWaypoints } }) {

  try {
      let res;
      if (joinedWaypoints) {
        res = yield call(googleDirectionsCall, `https://maps.googleapis.com/maps/api/directions/json?&mode=bicycling&origin=${
            origin
          }&destination=${destination}&waypoints=via:enc:${joinedWaypoints}:&key=${googleAPIKEY}`);
      } else {
        res = yield call(googleDirectionsCall, `https://maps.googleapis.com/maps/api/directions/json?&mode=bicycling&origin=${
            origin
          }&destination=${destination}&key=${googleAPIKEY}`);
      }
      const points = Polyline.decode(res.data.routes[0].overview_polyline.points);
      const coords = points.map((point) => ({
          latitude: point[0],
          longitude: point[1],
        }));

      yield put({ type: UPDATE_ROUTE_COORDS, payload: coords });
      return coords;

    } catch (error) {
      console.log(error);
    }
};

const getActiveTripAsync = function* (action) {
  let filter = {
    'id_route': 315,
  };
  try {
    const activeTrip = yield call(dbSecureGET, 'route&location', JSON.stringify(filter));
    const activeTripWaypoints = activeTrip.waypoints;
    yield put({
      type: 'UPDATE_MAP_REGION',
      payload: {
        latitude: Number(activeTripWaypoints[0].lat),
        longitude: Number(activeTripWaypoints[0].lng),
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
        },
      });

    const coords = activeTripWaypoints.map(waypoint => {
      return {
        latitude: Number(waypoint.lat),
        longitude: Number(waypoint.lng),
      };
    });
    activeTrip['coords'] = coords;
    yield put({ type: 'GET_ACTIVE_TRIP_SUCCESS', payload: activeTrip });
  } catch (error) {
    console.log(error);
  }
};
const createTripAsync = function* (payload) {
  const {
    payload: {
      origin,
      destination,
      wayPoints,
      userId,
    },
  } = payload;
  try {
    // const result = yield call(dbSecurePOST, 'route', { waypoints, userId });)
    const res = yield call(
      googleDirectionsCall,
      'https://maps.googleapis.com/maps/api/directions/json?' +
      '&mode=bicycling' +
      `&origin=${origin}` +
      `&destination=${destination}` +
      `&waypoints=via:enc:${wayPoints}:` +
      `&key=${googleAPIKEY}`
    );
    if (res.status === 200) {
      const {
        data: {
          routes: [{
            legs: [{
              distance: { text },
              end_address,
              start_address,
              via_waypoint,
            }],
            overview_polyline: { points },
          }],
        },
      } = res;
      const routeTitle = `${start_address.split(',')[0]} to ${end_address.split(',')[0]}`;
      const mapImage = yield call(getGoogleRouteImage, points);
      yield put({ type: RETRIEVED_MAP_IMAGE, payload: { mapImage, routeTitle } });
      yield put({
        type: RETRIEVED_TRIP_DATA, payload: {
          text, routeTitle, via_waypoint, userId,
        },
      });
    }
  } catch (error) {
    console.log(error);
  }
};

const saveTripAsync = function* ({payload}) {
  const { tripData, tripStats } = payload;
  try {
    const result = yield call(dbSecurePOST, 'route', { tripData, tripStats });
    yield put({ type: CREATE_TRIP_SUCCESS, payload: result });
  } catch (error) {
    console.error(error);
  }
};

const loginFlow = function* () {
  while (true) {
    const initiateAction = yield take([INITIATE_LOGIN, INITIATE_LOGIN_DEMO]);

    const task = yield fork(authorizeUser, initiateAction);
    const action = yield take([LOGOUT, LOGIN_ERROR]);

    if (action.type === LOGOUT) {
      yield cancel(task);
    }
  }
};

const getUserTrips = function* ({ payload: { userId } }) {
  let filter = {
    id_user_account: userId,
  };
  try {
  const userTripRequest = yield call(dbSecureGET, 'route', filter);
    yield put({type: GET_USER_TRIPS_SUCCESS, payload: userTripRequest});
  } catch (error) {
    console.error(error);
  }
};

const getUserSessions = function* ({ payload: { userId } }) {
  let filter = {
    id_user_account: userId,
  };
  try {
  const userSessionRequest = yield call(dbSecureGET, 'session', filter);
    yield put({type: GET_USER_SESSIONS_SUCCESS, payload: userSessionRequest});
  } catch (error) {
    console.error(error);
  }
};

const postFavorite = function* ({payload: {userId, routeId}}) {
  try {
    const data = {
      id_user_account: userId,
      id_route: routeId,
    };
    const favoritePostRequest = yield call(dbSecurePOST, 'favorite', data);
    console.info(favoritePostRequest);
  } catch (error) {
    console.error(error);
  }
};

const getFavorite = function* ({payload: {userId}}) {
  try {
    const filter = {
      "favorite.id_user_account": userId,
    };
    const userFavorites = yield call(dbSecureGET, 'favorite', filter);
    yield put({type: GET_USER_FAVORITES_SUCCESS, payload: userFavorites});
  } catch (error) {
    console.error(error);
  }
};
//watcher saga - listen for actions to be dispatched, will call worker

const watchCreateTrip = function* () {
  while (true) {
    const initiateAction = yield take(CREATE_TRIP);

    const task = yield fork(createTripAsync, initiateAction);
    const action = yield take([CREATE_TRIP_CANCELLED, CREATE_TRIP_FAILED]);

    if (action.type === CREATE_TRIP_CANCELLED) {
      yield cancel(task);
    }
  }
};

const watchSaveTrip = function* () {
  yield takeLatest(CREATE_TRIP_SAVE, saveTripAsync);
};

const watchGetTrips = function* () {
  yield takeEvery(GET_TRIPS, getTripsAsync);
};

const watchGetUserLocation = function* () {
  yield takeEvery(GET_USER_LOCATION, getUserLocationAsync);
};

const watchGetDirections = function* () {
  yield takeEvery(GET_DIRECTIONS, getUserDirectionsAsync);
};

const watchUserTrips = function* () {
  yield takeLatest(GET_USER_TRIPS, getUserTrips);
};

const watchUserSessions = function* () {
  yield takeLatest(GET_USER_SESSIONS, getUserSessions);
};

const watchPostFavorite = function* () {
  yield takeEvery(POST_FAVORITE, postFavorite);
};

const watchGetFavorite = function* () {
  yield takeLatest(GET_USER_FAVORITES, getFavorite);
};
//combine watcher sagas to root saga

const watchGetActiveTrip = function* () {  
  yield takeEvery('GET_ACTIVE_TRIP', getActiveTripAsync);
};

const rootSaga = function* () {
  yield all([
    watchGetTrips(),
    watchCreateTrip(),
    watchSaveTrip(),
    loginFlow(),
    watchGetUserLocation(),
    watchGetDirections(),
    watchGetActiveTrip(),
    watchUserTrips(),
    watchUserSessions(),
    watchPostFavorite(),
    watchGetFavorite(),
  ]);
};

export { rootSaga, watchGetTrips, watchGetUserLocation, watchGetDirections, watchUserTrips, watchUserSessions, watchPostFavorite, watchGetFavorite };
