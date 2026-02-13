use pyo3::prelude::*;

#[pyfunction]
fn vector_sum(values: Vec<f64>) -> PyResult<f64> {
    #[cfg(target_arch = "x86_64")]
    {
        if std::is_x86_feature_detected!("avx2") {
            return Ok(unsafe { sum_avx2(&values) });
        }
    }
    Ok(values.into_iter().sum())
}

#[cfg(target_arch = "x86_64")]
unsafe fn sum_avx2(values: &[f64]) -> f64 {
    use std::arch::x86_64::*;

    let mut sum = _mm256_setzero_pd();
    let mut i = 0;
    let len = values.len();

    while i + 3 < len {
        let ptr = values.as_ptr().add(i);
        let chunk = _mm256_loadu_pd(ptr);
        sum = _mm256_add_pd(sum, chunk);
        i += 4;
    }

    let mut tmp = [0.0f64; 4];
    _mm256_storeu_pd(tmp.as_mut_ptr(), sum);
    let mut total = tmp.iter().sum::<f64>();

    while i < len {
        total += values[i];
        i += 1;
    }

    total
}

#[pymodule]
fn mission_planner_simd(_py: Python<'_>, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(vector_sum, m)?)?;
    Ok(())
}
