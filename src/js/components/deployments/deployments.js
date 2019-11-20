import React from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs } from '@material-ui/core';

import AppStore from '../../stores/app-store';
import { getAllGroupDevices, selectDevice } from '../../actions/deviceActions';
import { selectRelease } from '../../actions/releaseActions';
import { saveGlobalSettings } from '../../actions/userActions';
import { setSnackbar } from '../../actions/appActions';

import AppActions from '../../actions/app-actions';
import { setRetryTimer, clearRetryTimer, clearAllRetryTimers } from '../../utils/retrytimer';

import Loader from '../common/loader';
import DeploymentsList from './deploymentslist';
import Progress from './inprogressdeployments';
import Past from './pastdeployments';
import Report from './report';
import CreateDialog from './createdeployment';

import { deepCompare, preformatWithRequestID, standardizePhases } from '../../helpers';
import { getOnboardingComponentFor } from '../../utils/onboardingmanager';

const MAX_PREVIOUS_PHASES_COUNT = 5;
const DEFAULT_PENDING_INPROGRESS_COUNT = 10;

const routes = {
  active: {
    route: '/deployments/active',
    title: 'Active'
  },
  finished: {
    route: '/deployments/finished',
    title: 'Finished'
  }
};

export class Deployments extends React.Component {
  static contextTypes = {
    router: PropTypes.object
  };

  constructor(props, context) {
    super(props, context);
    const today = new Date();
    today.setHours(0, 0, 0);
    const tonight = new Date();
    tonight.setHours(23, 59, 59);
    this.state = {
      docsVersion: this.props.docsVersion ? `${this.props.docsVersion}/` : 'development/',
      invalid: true,
      startDate: today,
      endDate: tonight,
      per_page: 20,
      progPage: 1,
      pendPage: 1,
      pastPage: 1,
      refreshDeploymentsLength: 30000,
      reportDialog: false,
      createDialog: false,
      ...this._getInitialState()
    };
  }

  componentWillMount() {
    AppStore.changeListener(this._onChange.bind(this));
  }

  componentDidMount() {
    var self = this;
    clearAllRetryTimers(self.props.setSnackbar);
    this.timer = setInterval(() => this._refreshDeployments(), this.state.refreshDeploymentsLength);
    this._refreshDeployments();
    self.props.selectRelease();
    self.props.selectDevice();
    self.props.groups.map(group => self.props.getAllGroupDevices(group));
    if (this.props.match) {
      const params = new URLSearchParams(this.props.location.search);
      if (params && params.get('open')) {
        if (params.get('id')) {
          self._getReportById(params.get('id'));
        } else if (params.get('release')) {
          self.props.selectRelease(params.get('release'));
        } else if (params.get('deviceId')) {
          self.props.selectDevice(params.get('deviceId')).catch(err => {
            console.log(err);
            var errMsg = err.res.body.error || '';
            self.props.setSnackbar(preformatWithRequestID(err.res, `Error fetching device details. ${errMsg}`), null, 'Copy to clipboard');
          });
        } else {
          setTimeout(() => self.setState({ createDialog: true }), 400);
        }
      }
    }
    const query = new URLSearchParams(this.props.location.search);
    this.setState({
      reportType: this.props.match ? this.props.match.params.tab : 'active',
      createDialog: Boolean(query.get('open')),
      doneLoading: true
    });
  }

  componentWillUnmount() {
    clearInterval(this.timer);
    clearAllRetryTimers(this.props.setSnackbar);
    AppStore.removeChangeListener(this._onChange.bind(this));
  }

  _getInitialState() {
    return {
      tabIndex: this._updateActive(),
      past: AppStore.getPastDeployments(),
      pending: AppStore.getPendingDeployments(),
      progress: AppStore.getDeploymentsInProgress() || [],
      events: AppStore.getEventLog(),
      hasDeployments: AppStore.getHasDeployments(),
      isHosted: AppStore.getIsHosted()
    };
  }

  _refreshDeployments() {
    if (this._getCurrentLabel() === routes.finished.title) {
      this._refreshPast(null, null, null, null, this.state.groupFilter);
    } else {
      this._refreshInProgress();
      this._refreshPending();
      if (!this.props.onboardingComplete) {
        this._refreshPast(null, null, null, null, this.state.groupFilter);
      }
    }
  }
  _refreshInProgress(page, per_page = DEFAULT_PENDING_INPROGRESS_COUNT) {
    /*
    / refresh only in progress deployments
    /
    */
    var self = this;
    if (page) {
      self.setState({ progPage: page });
    } else {
      page = self.state.progPage;
    }

    return Promise.all([
      AppActions.getDeploymentsInProgress(page, per_page),
      // Get full count of deployments for pagination
      AppActions.getDeploymentCount('inprogress')
    ])
      .then(results => {
        const deployments = results[0];
        const progressCount = results[1];
        self.setState({ doneLoading: true, progressCount });
        clearRetryTimer('progress', self.props.setSnackbar);
        if (progressCount && !deployments.length) {
          self._refreshInProgress(1);
        }
      })
      .catch(err => {
        console.log(err);
        var errormsg = err.error || 'Please check your connection';
        setRetryTimer(err, 'deployments', `Couldn't load deployments. ${errormsg}`, self.state.refreshDeploymentsLength, self.props.setSnackbar);
      });
  }
  _refreshPending(page, per_page = DEFAULT_PENDING_INPROGRESS_COUNT) {
    /*
    / refresh only pending deployments
    /
    */
    var self = this;
    if (page) {
      self.setState({ pendPage: page });
    } else {
      page = self.state.pendPage;
    }

    return AppActions.getPendingDeployments(page, per_page)
      .then(result => {
        self.props.setSnackbar('');
        const { deployments, links } = result;

        // Get full count of deployments for pagination
        if (links.next || links.prev) {
          return AppActions.getDeploymentCount('pending').then(pendingCount => {
            self.setState({ pendingCount });
            if (pendingCount && !deployments.length) {
              self._refreshPending(1);
            }
          });
        } else {
          self.setState({ pendingCount: deployments.length });
        }
      })
      .catch(err => {
        console.log(err);
        var errormsg = err.error || 'Please check your connection';
        setRetryTimer(err, 'deployments', `Couldn't load deployments. ${errormsg}`, self.state.refreshDeploymentsLength, self.props.setSnackbar);
      });
  }

  _changePastPage(
    page = this.state.pastPage,
    startDate = this.state.startDate,
    endDate = this.state.endDate,
    per_page = this.state.per_page,
    group = this.state.group
  ) {
    var self = this;
    self.setState({ doneLoading: false }, () => {
      clearInterval(self.timer);
      self._refreshPast(page, startDate, endDate, per_page, group);
      self.timer = setInterval(() => self._refreshDeployments(), self.state.refreshDeploymentsLength);
    });
  }
  _refreshPast(page, startDate, endDate, per_page, group) {
    /*
    / refresh only finished deployments
    /
    */
    var self = this;

    var oldCount = self.state.pastCount;
    var oldPage = self.state.pastPage;

    startDate = startDate || self.state.startDate;
    endDate = endDate || self.state.endDate;
    per_page = per_page || self.state.per_page;

    self.setState({ startDate, endDate, groupFilter: group });

    startDate = Math.round(Date.parse(startDate) / 1000);
    endDate = Math.round(Date.parse(endDate) / 1000);

    // get total count of past deployments first
    return AppActions.getDeploymentCount('finished', startDate, endDate, group)
      .then(count => {
        page = page || self.state.pastPage || 1;
        self.setState({ pastCount: count, pastPage: page });
        // only refresh deployments if page, count or date range has changed
        if (oldPage !== page || oldCount !== count || !self.state.doneLoading) {
          return AppActions.getPastDeployments(page, per_page, startDate, endDate, group).then(AppActions.getDeploymentsWithStats);
        }
      })
      .then(() => {
        self.setState({ doneLoading: true });
        self.props.setSnackbar('');
      })
      .catch(err => {
        console.log(err);
        self.setState({ doneLoading: true });
        var errormsg = err.error || 'Please check your connection';
        setRetryTimer(err, 'deployments', `Couldn't load deployments. ${errormsg}`, self.state.refreshDeploymentsLength, self.props.setSnackbar);
      });
  }

  _onChange() {
    this.setState(this._getInitialState());
  }

  _retryDeployment(deployment, devices) {
    const self = this;
    const release = { name: deployment.artifact_name, device_types_compatible: deployment.device_types_compatible || [] };
    const deploymentObject = {
      group: deployment.name,
      deploymentDeviceIds: devices.map(item => item.id),
      release,
      phases: null
    };
    self.setState({ deploymentObject, createDialog: true, reportDialog: false });
  }

  _onScheduleSubmit(deploymentObject) {
    var self = this;
    const { group, deploymentDeviceIds, release, phases } = deploymentObject;
    var newDeployment = {
      name: decodeURIComponent(group) || 'All devices',
      artifact_name: release.name,
      devices: deploymentDeviceIds,
      phases: phases
    };
    self.setState({ doneLoading: false, createDialog: false, reportDialog: false });

    return AppActions.createDeployment(newDeployment)
      .then(data => {
        var lastslashindex = data.lastIndexOf('/');
        var id = data.substring(lastslashindex + 1);
        clearInterval(self.timer);

        return AppActions.getSingleDeployment(id).then(data => {
          if (data) {
            // successfully retrieved new deployment
            if (self._getCurrentLabel() !== routes.active.title) {
              self.context.router.history.push(routes.active.route);
              self._changeTab(routes.active.route);
            } else {
              self.timer = setInterval(() => self._refreshDeployments(), self.state.refreshDeploymentsLength);
              self._refreshDeployments();
            }
            self.props.setSnackbar('Deployment created successfully', 8000);
          } else {
            self.props.setSnackbar('Error while creating deployment');
          }
          return Promise.resolve();
        });
      })
      .catch(err => {
        var errMsg = err.res.body.error || '';
        self.props.setSnackbar(preformatWithRequestID(err.res, `Error creating deployment. ${errMsg}`), null, 'Copy to clipboard');
      })
      .then(() => self.setState({ doneLoading: true, deploymentObject: null }))
      .then(() => {
        const standardPhases = standardizePhases(phases);
        let previousPhases = self.props.settings.previousPhases || [];
        previousPhases = previousPhases.map(standardizePhases);
        if (!previousPhases.find(previousPhaseList => previousPhaseList.every(oldPhase => standardPhases.find(phase => deepCompare(phase, oldPhase))))) {
          previousPhases.push(standardPhases);
        }
        self.props.saveGlobalSettings({ previousPhases: previousPhases.slice(-1 * MAX_PREVIOUS_PHASES_COUNT) });
      });
  }
  _getReportById(id) {
    var self = this;
    return AppActions.getSingleDeployment(id).then(data => self._showReport(data, self.state.reportType));
  }
  _showReport(selectedDeployment, reportType) {
    this.setState({ createDialog: false, selectedDeployment, reportType, reportDialog: true });
  }
  _showProgress(rowNumber) {
    var deployment = this.state.progress[rowNumber];
    this._showReport(deployment, 'active');
  }
  _abortDeployment(id) {
    var self = this;
    return AppActions.abortDeployment(id)
      .then(() => {
        self.setState({ doneLoading: false });
        clearInterval(self.timer);
        self.timer = setInterval(() => self._refreshDeployments(), self.state.refreshDeploymentsLength);
        self._refreshDeployments();
        self.setState({ createDialog: false });
        self.props.setSnackbar('The deployment was successfully aborted');
      })
      .catch(err => {
        console.log(err);
        var errMsg = err.res.body.error || '';
        self.props.setSnackbar(preformatWithRequestID(err.res, `There was wan error while aborting the deployment: ${errMsg}`));
      });
  }
  updated() {
    // use to make sure re-renders dialog at correct height when device list built
    this.setState({ updated: true });
  }

  _updateActive(tab = this.context.router.route.match.params.tab) {
    if (routes.hasOwnProperty(tab)) {
      return routes[tab].route;
    }
    return routes.active.route;
  }

  _getCurrentLabel(tab = this.context.router.route.match.params.tab) {
    if (routes.hasOwnProperty(tab)) {
      return routes[tab].title;
    }
    return routes.active.title;
  }

  _changeTab(tabIndex) {
    var self = this;
    clearInterval(self.timer);
    self.timer = setInterval(() => self._refreshDeployments(), self.state.refreshDeploymentsLength);
    self.setState({ tabIndex, pendPage: 1, pastPage: 1, progPage: 1 }, () => self._refreshDeployments());
    self.props.setSnackbar('');
  }

  render() {
    const self = this;
    var reportActions = [
      <Button key="report-action-button-1" onClick={() => self.setState({ reportDialog: false })}>
        Close
      </Button>
    ];

    const dialogProps = {
      updated: () => this.setState({ updated: true }),
      deployment: this.state.selectedDeployment
    };
    let dialogContent = <Report retry={(deployment, devices) => this._retryDeployment(deployment, devices)} past={true} {...dialogProps} />;
    if (this.state.reportType === 'active') {
      dialogContent = <Report abort={id => this._abortDeployment(id)} {...dialogProps} />;
    }

    // tabs
    const { past, per_page, pastCount, tabIndex } = this.state;
    let onboardingComponent = null;
    if (past.length || pastCount) {
      onboardingComponent = getOnboardingComponentFor('deployments-past', { anchor: { left: 240, top: 50 } });
    }

    return (
      <div className="relative">
        <Button
          className="top-right-button"
          color="secondary"
          variant="contained"
          onClick={() => this.setState({ createDialog: true })}
          style={{ position: 'absolute' }}
        >
          Create a deployment
        </Button>
        <Tabs value={tabIndex} onChange={(e, tabIndex) => this._changeTab(tabIndex)} style={{ display: 'inline-block' }}>
          {Object.values(routes).map(route => (
            <Tab component={Link} key={route.route} label={route.title} to={route.route} value={route.route} />
          ))}
        </Tabs>

        {tabIndex === routes.active.route && (
          <>
            {this.state.doneLoading ? (
              <div className="margin-top">
                <DeploymentsList
                  abort={id => this._abortDeployment(id)}
                  count={this.state.pendingCount || this.state.pending.length}
                  items={this.state.pending}
                  page={this.state.pendPage}
                  refreshItems={(...args) => this._refreshPending(...args)}
                  isActiveTab={self._getCurrentLabel() === routes.active.title}
                  title="pending"
                  type="pending"
                />
                <Progress
                  abort={id => this._abortDeployment(id)}
                  count={this.state.progressCount || this.state.progress.length}
                  items={this.state.progress}
                  page={this.state.progPage}
                  refreshItems={(...args) => this._refreshInProgress(...args)}
                  isActiveTab={self._getCurrentLabel() === routes.active.title}
                  openReport={rowNum => this._showProgress(rowNum)}
                  title="In progress"
                  type="progress"
                />
                {!(this.state.progressCount || this.state.progress.length || this.state.pendingCount || this.state.pending.length) && (
                  <div className={this.state.progress.length || !this.state.doneLoading ? 'hidden' : 'dashboard-placeholder'}>
                    <p>Pending and ongoing deployments will appear here. </p>
                    <p>
                      <a onClick={() => this.setState({ createDialog: true })}>Create a deployment</a> to get started
                    </p>
                    <img src="assets/img/deployments.png" alt="In progress" />
                  </div>
                )}
              </div>
            ) : (
              <Loader show={this.state.doneLoading} />
            )}
          </>
        )}
        {tabIndex === routes.finished.route && (
          <div className="margin-top">
            <Past
              groups={this.props.groups}
              deviceGroup={this.state.groupFilter}
              createClick={() => this.setState({ createDialog: true })}
              pageSize={per_page}
              onChangeRowsPerPage={perPage => self.setState({ per_page: perPage, pastPage: 1 }, () => self._changePastPage())}
              startDate={this.state.startDate}
              endDate={this.state.endDate}
              page={this.state.pastPage}
              isActiveTab={self._getCurrentLabel() === routes.finished.title}
              count={pastCount}
              loading={!this.state.doneLoading}
              past={past}
              refreshPast={(...args) => this._changePastPage(...args)}
              showReport={(deployment, type) => this._showReport(deployment, type)}
            />
          </div>
        )}

        <Dialog open={self.state.reportDialog} fullWidth={true} maxWidth="lg">
          <DialogTitle>{self.state.reportType === 'active' ? 'Deployment progress' : 'Results of deployment'}</DialogTitle>
          <DialogContent className={self.state.contentClass} style={{ overflow: 'hidden' }}>
            {dialogContent}
          </DialogContent>
          <DialogActions>{reportActions}</DialogActions>
        </Dialog>

        <CreateDialog
          open={this.state.createDialog}
          onDismiss={() => self.setState({ createDialog: false, deploymentObject: null })}
          onScheduleSubmit={(...args) => this._onScheduleSubmit(...args)}
          deploymentObject={self.state.deploymentObject}
        />
        {onboardingComponent}
      </div>
    );
  }
}

const actionCreators = { getAllGroupDevices, saveGlobalSettings, selectDevice, selectRelease, setSnackbar };

const mapStateToProps = state => {
  return {
    groups: Object.keys(state.devices.groups.byId),
    groupDevices: state.devices.groups.byId,
    onboardingComplete: state.users.onboarding.complete,
    settings: state.users.globalSettings,
    showHelptips: state.users.showHelptips,
    user: state.users.byId[state.users.currentUser] || {}
  };
};

export default connect(
  mapStateToProps,
  actionCreators
)(Deployments);
