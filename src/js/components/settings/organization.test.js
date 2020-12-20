import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import configureStore from 'redux-mock-store';
import MyOrganization, {
  OrgHeader,
  TrialExpirationNote,
  DeviceLimitExpansionNotification,
  EnterpriseModificationsNote,
  CancelSubscriptionAlert,
  CancelSubscriptionButton
} from './organization';
import { defaultState, undefineds } from '../../../../tests/mockData';

const mockStore = configureStore([thunk]);

describe('MyOrganization Component', () => {
  let store;
  beforeEach(() => {
    Date.now = jest.fn(() => new Date('2020-07-01T12:00:00.000Z'));
    store = mockStore({
      ...defaultState,
      app: {
        ...defaultState.app,
        features: {
          ...defaultState.app.features,
          isHosted: true
        }
      },
      devices: {
        ...defaultState.devices,
        byStatus: {
          ...defaultState.devices.byStatus,
          accepted: {
            ...defaultState.devices.byStatus.accepted,
            total: 1
          }
        },
        limit: null
      },
      organization: {
        ...defaultState.organization,
        card: {
          last4: '1234',
          expiration: { month: 8, year: 1230 },
          brand: 'Visa'
        },
        organization: {
          ...defaultState.organization.organization,
          plan: 'enterprise',
          tenant_token: 'test',
          trial: true,
          trial_expiration: new Date('2021-01-01T00:00:00Z')
        }
      }
    });
  });

  it('renders correctly', () => {
    const tree = renderer
      .create(
        <MemoryRouter>
          <Provider store={store}>
            <MyOrganization />
          </Provider>
        </MemoryRouter>
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
    expect(JSON.stringify(tree)).toEqual(expect.not.stringMatching(undefineds));
  });
});

describe('smaller components', () => {
  [OrgHeader, TrialExpirationNote, DeviceLimitExpansionNotification, EnterpriseModificationsNote, CancelSubscriptionAlert, CancelSubscriptionButton].forEach(
    Component => {
      it(`renders ${Component.displayName || Component.name} correctly`, () => {
        const tree = renderer
          .create(
            <MemoryRouter>
              <Component
                trial_expiration="2019-10-05T13:00:00.000Z"
                isTrial={true}
                handleCancelSubscription={jest.fn}
                orgName="test"
                mailBodyTexts={{ billing: 'bill this', upgrade: 'upgrade here' }}
              />
            </MemoryRouter>
          )
          .toJSON();

        expect(tree).toMatchSnapshot();
        expect(JSON.stringify(tree)).toEqual(expect.not.stringMatching(undefineds));
      });
    }
  );
});
