import reducer, { initialState } from './userReducer';
import * as UserConstants from '../constants/userConstants';
import { defaultState } from '../../../tests/mockData';

const testUser = {
  created_ts: '',
  email: 'test@example.com',
  id: '123',
  roles: ['RBAC_ROLE_PERMIT_ALL'],
  tfasecret: '',
  updated_ts: ''
};

describe('user reducer', () => {
  it('should return the initial state', () => {
    expect(reducer(undefined, {})).toEqual(initialState);
  });

  it('should handle RECEIVED_QR_CODE', () => {
    expect(reducer(undefined, { type: UserConstants.RECEIVED_QR_CODE, value: '123' }).qrCode).toEqual('123');
    expect(reducer(initialState, { type: UserConstants.RECEIVED_QR_CODE, value: '123' }).qrCode).toEqual('123');
  });

  it('should handle SUCCESSFULLY_LOGGED_IN', () => {
    expect(reducer(undefined, { type: UserConstants.SUCCESSFULLY_LOGGED_IN, value: '123' }).jwtToken).toEqual('123');
    expect(reducer(initialState, { type: UserConstants.SUCCESSFULLY_LOGGED_IN, value: '123' }).jwtToken).toEqual('123');
  });

  it('should handle RECEIVED_USER_LIST', () => {
    expect(reducer(undefined, { type: UserConstants.RECEIVED_USER_LIST, users: { '123': testUser } }).byId).toEqual({ '123': testUser });
    expect(reducer({ ...initialState, byId: { '123': testUser } }, { type: UserConstants.RECEIVED_USER_LIST, users: { '456': testUser } }).byId).toEqual({
      '456': testUser
    });
  });

  it('should handle RECEIVED_USER', () => {
    expect(reducer(undefined, { type: UserConstants.RECEIVED_USER, user: testUser }).byId).toEqual({ '123': testUser });
    expect(reducer({ ...initialState, byId: { '123': testUser } }, { type: UserConstants.RECEIVED_USER, user: testUser }).byId).toEqual({ '123': testUser });
  });

  it('should handle CREATED_USER', () => {
    expect(reducer(undefined, { type: UserConstants.CREATED_USER, user: testUser }).byId).toEqual({ 0: testUser });
    expect(reducer({ ...initialState, byId: { '123': testUser } }, { type: UserConstants.CREATED_USER, user: testUser }).byId).toEqual({
      '123': testUser,
      0: testUser
    });
  });

  it('should handle REMOVED_USER', () => {
    expect(reducer(undefined, { type: UserConstants.REMOVED_USER, userId: '123' }).byId).toEqual({});
    expect(reducer({ ...initialState, byId: { '123': testUser, '456': testUser } }, { type: UserConstants.REMOVED_USER, userId: '123' }).byId).toEqual({
      '456': testUser
    });
  });

  it('should handle UPDATED_USER', () => {
    expect(reducer(undefined, { type: UserConstants.UPDATED_USER, userId: '123', user: testUser }).byId).toEqual({ '123': testUser });

    expect(
      reducer(
        { ...initialState, byId: { '123': testUser } },
        { type: UserConstants.UPDATED_USER, userId: '123', user: { ...testUser, email: 'test@mender.io' } }
      ).byId['123'].email
    ).toEqual('test@mender.io');
  });
  it('should handle RECEIVED_ROLES', () => {
    const roles = reducer(undefined, { type: UserConstants.RECEIVED_ROLES, rolesById: { ...defaultState.users.rolesById } }).rolesById;
    Object.entries(defaultState.users.rolesById).forEach(([key, role]) => expect(roles[key]).toEqual(role));
    expect(
      reducer(
        { ...initialState, rolesById: { thingsRole: { test: 'test' } } },
        { type: UserConstants.RECEIVED_ROLES, rolesById: { ...defaultState.users.rolesById } }
      ).rolesById.thingsRole
    ).toBeTruthy();
  });
  it('should handle REMOVED_ROLE', () => {
    expect(reducer(undefined, { type: UserConstants.REMOVED_ROLE, roleId: defaultState.users.rolesById.test.title }).rolesById.test).toBeFalsy();
    expect(
      reducer(
        { ...initialState, rolesById: { ...defaultState.users.rolesById } },
        { type: UserConstants.REMOVED_ROLE, roleId: defaultState.users.rolesById.test.title }
      ).rolesById.test
    ).toBeFalsy();
  });
  it('should handle CREATED_ROLE', () => {
    expect(
      reducer(undefined, {
        type: UserConstants.CREATED_ROLE,
        roleId: 'newRole',
        role: { name: 'newRole', description: 'new description', groups: ['123'] }
      }).rolesById.newRole.description
    ).toEqual('new description');
    expect(
      reducer(
        { ...initialState },
        {
          type: UserConstants.CREATED_ROLE,
          roleId: 'newRole',
          role: { name: 'newRole', description: 'new description', groups: ['123'] }
        }
      ).rolesById.newRole.description
    ).toEqual('new description');
  });
  it('should handle UPDATED_ROLE', () => {
    expect(
      reducer(undefined, { type: UserConstants.UPDATED_ROLE, roleId: 'RBAC_ROLE_CI', role: { description: 'new description' } }).rolesById.RBAC_ROLE_CI.title
    ).toEqual('CI');
    expect(
      reducer({ ...initialState }, { type: UserConstants.UPDATED_ROLE, roleId: 'RBAC_ROLE_CI', role: { description: 'new description' } }).rolesById
        .RBAC_ROLE_CI.title
    ).toEqual('CI');
  });

  it('should handle SET_GLOBAL_SETTINGS', () => {
    expect(reducer(undefined, { type: UserConstants.SET_GLOBAL_SETTINGS, settings: { newSetting: 'test' } }).globalSettings).toEqual({
      ...initialState.globalSettings,
      newSetting: 'test'
    });
    expect(reducer({ ...initialState }, { type: UserConstants.SET_GLOBAL_SETTINGS, settings: { newSetting: 'test' } }).globalSettings).toEqual({
      ...initialState.globalSettings,
      newSetting: 'test'
    });
  });
  it('should handle SET_SHOW_HELP', () => {
    expect(reducer(undefined, { type: UserConstants.SET_SHOW_HELP, show: false }).showHelptips).toEqual(false);
    expect(reducer({ ...initialState }, { type: UserConstants.SET_SHOW_HELP, show: true }).showHelptips).toEqual(true);
  });
  it('should handle SET_SHOW_CONNECT_DEVICE', () => {
    expect(reducer(undefined, { type: UserConstants.SET_SHOW_CONNECT_DEVICE, show: false }).showConnectDeviceDialog).toEqual(false);
    expect(reducer({ ...initialState }, { type: UserConstants.SET_SHOW_CONNECT_DEVICE, show: true }).showConnectDeviceDialog).toEqual(true);
  });
});
