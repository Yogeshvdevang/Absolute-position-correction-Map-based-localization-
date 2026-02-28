import numpy as np


class EKF:
  def __init__(self):
    self.X = np.zeros((4, 1))  # x,y,vx,vy
    self.P = np.eye(4)
    self.Q = np.eye(4) * 0.05
    self.R = np.eye(2) * 10

  def predict(self, dt):
    F = np.array([
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ])

    self.X = F @ self.X
    self.P = F @ self.P @ F.T + self.Q

  def update(self, z):
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
