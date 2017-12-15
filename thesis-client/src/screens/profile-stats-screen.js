import React, { Component } from "react";
import PropTypes from "prop-types";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { connect } from "react-redux";
import { getUserRoutes, getUserSessions } from "../actions/getUserInfo-action";
import { getActiveTrip } from "../actions/activeTrip-action";
// import { STATUS_BAR_HEIGHT } from '../constants';
import ProfileStats from "../components/profile-stats-component";
import ProfileRoutes from "../components/profile-routes-component";

class ProfileStatsScreen extends Component {
  static propTypes = {
    showTripLocation: PropTypes.func.isRequired,
    navigation: PropTypes.shape({}).isRequired,
    getUserSessions: PropTypes.func.isRequired,
    getUserRoutes: PropTypes.func.isRequired,
    //eslint-disable-next-line
    user: PropTypes.object.isRequired,
    // eslint-disable-next-line
    sessions: PropTypes.array.isRequired,
    // eslint-disable-next-line
    routes: PropTypes.array.isRequired
  };

  static navigationOptions = {
    title: "Stats"
  };

  componentWillMount() {
    this.props.getUserSessions(this.props.user.id);
    this.props.getUserRoutes(this.props.user.id);
  }

  render() {
    return (
      <View style={styles.container}>
        <ProfileStats sessions={this.props.sessions} />
      </View>
    );
  }
}

function mapStateToProps(state) {
  return {
    user: state.user,
    routes: state.userRoutes.routes,
    sessions: state.userSessions.sessions
  };
}

const mapDispatchToProps = dispatch => ({
  showTripLocation: (trip, cb) => {
    dispatch(getActiveTrip(trip, cb));
  },
  getUserSessions: userId => {
    dispatch(getUserSessions(userId));
  },
  getUserRoutes: userId => {
    dispatch(getUserRoutes(userId));
  }
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  }
});

export default connect(mapStateToProps, mapDispatchToProps)(ProfileStatsScreen);