import numpy as np


class EKF:
  def __init__(self):
    self.X = np.zeros((4, 1))  # x,y,vx,vy
    self.P = np.eye(4)
    self.Q = np.eye(4) * 0.05
    self.R = np.eye(2) * 10
    self.initialized = False

  def seed_position(self, x, y):
    self.X = np.array([[x], [y], [0.0], [0.0]], dtype=float)
    self.P = np.eye(4)
    self.initialized = True

  def predict(self, dt):
    if not self.initialized:
      return
    F = np.array([
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ])

    self.X = F @ self.X
    self.P = F @ self.P @ F.T + self.Q

  def update(self, z):
    if not self.initialized:
      self.seed_position(float(z[0, 0]), float(z[1, 0]))
      return
    H = np.array([
      [1, 0, 0, 0],
      [0, 1, 0, 0]
    ])
    y = z - H @ self.X
    S = H @ self.P @ H.T + self.R
    K = self.P @ H.T @ np.linalg.inv(S)

    self.X = self.X + K @ y
    self.P = (np.eye(4) - K @ H) @ self.P

  def state(self):
    return self.X
