import React from 'react';
import PropTypes from 'prop-types';

import AppActions from '../../actions/app-actions';
import AppStore from '../../stores/app-store';
import pluralize from 'pluralize';
import LinearProgress from '@material-ui/core/LinearProgress';
import { statusToPercentage } from '../../helpers';
import { AppContext } from '../../contexts/app-context';

export default class ProgressChart extends React.Component {
  static contextTypes = {
    router: PropTypes.object
  };

  constructor(props, context) {
    super(props, context);
    this.state = {
      devices: [],
      stats: {
        downloading: 0,
        decommissioned: 0,
        failure: 0,
        installing: 0,
        noartifact: 0,
        pending: 0,
        rebooting: 0,
        success: 0,
        'already-installed': 0
      },
      device: {
        name: '',
        status: ''
      }
    };
  }
  componentDidMount() {
    this.timer = setInterval(() => this.refreshDeploymentDevices(), 30000);
    this.refreshDeploymentDevices();
  }
  componentWillUnmount() {
    clearInterval(this.timer);
  }
  refreshDeploymentDevices() {
    const self = this;
    const deploymentStatsRequest = AppActions.getSingleDeploymentStats(self.props.deployment.id).then(stats => self.setState({ stats: stats }));
    const deploymentDevicesRequest = AppActions.getSingleDeploymentDevices(self.props.deployment.id).then(devices => {
      var sortedDevices = AppStore.getOrderedDeploymentDevices(devices);
      self.setState({ devices: sortedDevices });
    });
    return Promise.all([deploymentStatsRequest, deploymentDevicesRequest]);
  }
  _handleClick(id) {
    var filter = `id=${id}`;
    this.context.router.history.push(`/devices/${filter}`);
  }
  _hoverDevice(device) {
    if (!device) {
      device = {
        name: '',
        status: ''
      };
    }

    var self = this;

    if (device.id) {
      // get device id data for individual device
      return AppActions.getDeviceAuth(device.id)
        .then(data => {
          device.identity_data = data.identity_data;
          self.setState({ device: device });
        })
        .catch(err => console.log(`Error: ${err}`));
    }
  }
  render() {
    var skipped = this.state.stats.noartifact + this.state.stats['already-installed'];
    var totalDevices = this.state.devices.length - skipped;

    var success = this.state.stats.success;
    var failures = this.state.stats.failure + this.state.stats.decommissioned;
    var dev = this.state.devices.length;

    // figure out best fit number of rows
    var rows = Math.floor(Math.sqrt(dev));

    while (dev % rows != 0) {
      rows = rows - 1;
    }

    if (rows === 1 && dev * 90 > 400) {
      rows = Math.ceil(this.state.devices.length / 5);
    }

    // do rough calculation for displaying circles in correct size
    var pixelHeight = 100 / rows;
    var real_per_row = 400 / pixelHeight;
    var real_rows = dev / real_per_row;
    if (real_per_row > rows) {
      while (pixelHeight * real_rows < 80) {
        pixelHeight += 1;
        real_per_row = 400 / pixelHeight;
        real_rows = dev / real_per_row;
      }
    }

    var deviceGrid = this.state.devices.map(function(device, index) {
      if (device.status !== 'noartifact' && device.status !== 'already-installed') {
        return (
          <div key={index} className={device.status} style={{ height: pixelHeight, width: pixelHeight }}>
            <div
              onMouseEnter={() => this._hoverDevice(device)}
              onMouseLeave={this._hoverDevice}
              onClick={() => this._handleClick(device.id)}
              className="bubble"
            />
          </div>
        );
      }
    }, this);

    var intervalsSinceStart = Math.floor((Date.now() - Date.parse(this.props.deployment.created)) / (1000 * 20));
    var percentage = statusToPercentage(this.state.device.status, intervalsSinceStart);

    var progressChart = (
      <AppContext.Consumer>
        {({ globalSettings }) => (
          <div className="relative">
            <div className="progressHeader">
              {success + failures} of {totalDevices} devices complete
              {skipped ? (
                <div className="skipped-text">
                  {skipped} {pluralize('devices', skipped)} {pluralize('was', skipped)} skipped
                </div>
              ) : null}
            </div>
            <div className="bubbles-contain">{deviceGrid}</div>
            <div className={!this.state.device.id ? 'device-info' : 'device-info show'}>
              <b>Device info:</b>
              <p>
                <b>{(globalSettings || {}).id_attribute || 'Device ID'}: </b>
                {(globalSettings || {}).id_attribute && (globalSettings || {}).id_attribute !== 'Device ID' && this.state.device.identity_data
                  ? this.state.device.identity_data[globalSettings.id_attribute]
                  : this.state.device.id}
              </p>
              <p>
                <b>Status: </b>
                {this.state.device.status}
              </p>
              <div className={'substateText'}>{this.state.device.substate}</div>

              {!['pending', 'decommissioned', 'aborted'].includes(this.state.device.status.toLowerCase()) && (
                <div>
                  <div className={'substateText'} style={{ textAlign: 'end' }}>
                    {percentage}%
                  </div>
                  <LinearProgress
                    color={this.state.device.status && this.state.device.status.toLowerCase() == 'failure' ? 'secondary' : 'primary'}
                    variant="determinate"
                    value={percentage}
                  />
                </div>
              )}
            </div>
            <div className="key">
              <div className="bubble failure" /> Failed <div className="bubble pending" /> Pending <div className="bubble inprogress" /> In progress{' '}
              <div className="bubble success" /> Successful
            </div>
          </div>
        )}
      </AppContext.Consumer>
    );
    return <div>{progressChart}</div>;
  }
}
