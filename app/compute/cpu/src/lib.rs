use pyo3::prelude::*;

#[pyfunction]
fn vector_sum(values: Vec<f64>) -> PyResult<f64> {
    Ok(values.into_iter().sum())
}

#[pymodule]
fn mission_planner_cpu(_py: Python<'_>, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(vector_sum, m)?)?;
    Ok(())
}
