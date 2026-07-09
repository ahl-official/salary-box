import React, { useState, useRef } from 'react'
import { api } from '../../utils/api'
import { useToast } from '../../context/ToastContext'

const CSV_TEMPLATE = `name,phone,role,department,branch,designation
Jane Doe,9876543210,employee,General,Back Office,Executive
John Smith,9876543211,employee,General,Salon,Stylist`

const HEADER_ALIASES = {
  name: 'name',
  phone: 'phone',
  mobile: 'phone',
  role: 'role',
  department: 'department',
  dept: 'department',
  branch: 'branch',
  designation: 'designation',
  title: 'designation',
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  return digits
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []

  const headers = lines[0].split(',').map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || h.trim().toLowerCase())
  const hasHeader = headers.includes('name') && headers.includes('phone')
  const dataLines = hasHeader ? lines.slice(1) : lines.map((line) => `,${line}`)

  if (!hasHeader && lines.length) {
    // No header row — assume: name,phone,department,designation
    return lines.map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      return {
        name: parts[0] || '',
        phone: normalizePhone(parts[1]),
        role: parts[2] || 'employee',
        department: parts[3] || 'General',
        branch: parts[4] || '',
        designation: parts[5] || 'Employee',
      }
    })
  }

  return dataLines.map((line) => {
    const parts = line.split(',').map((p) => p.trim())
    const row = {}
    headers.forEach((h, i) => {
      row[h] = parts[i] || ''
    })
    return {
      name: row.name || '',
      phone: normalizePhone(row.phone),
      role: row.role || 'employee',
      department: row.department || 'General',
      branch: row.branch || '',
      designation: row.designation || 'Employee',
    }
  }).filter((r) => r.name || r.phone)
}

export default function EmployeeUpload({ branches, onClose, onImported }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [branch, setBranch] = useState(branches[0]?.name || 'Back Office')
  const [preview, setPreview] = useState([])
  const [uploading, setUploading] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const rows = parseCsv(String(e.target.result || ''))
        setPreview(rows)
        if (!rows.length) toast('No valid rows found in file', 'error')
      } catch (err) {
        toast('Could not read CSV file', 'error')
      }
    }
    reader.readAsText(file)
  }

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'employee_upload_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleUpload = async () => {
    if (!preview.length) {
      toast('Add a CSV file first', 'error')
      return
    }
    setUploading(true)
    try {
      const rows = preview.map((r) => ({
        ...r,
        branch: r.branch || branch,
      }))
      const result = await api.bulkImportEmployees({ employees: rows, default_branch: branch })
      const skipped = result.skipped?.length || 0
      toast(
        `Uploaded ${result.count} employee${result.count === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`,
        result.count ? 'success' : 'error'
      )
      onImported()
      onClose()
    } catch (err) {
      toast(err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="card mt-16 fade-in employee-upload-card">
      <div className="employee-upload-header">
        <div>
          <p className="employee-upload-title">Upload employees</p>
          <p className="employee-upload-subtitle">
            CSV columns: name, phone, department, branch, designation
          </p>
        </div>
        <button type="button" className="btn btn-secondary employee-upload-close-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="employee-upload-layout">
        <div className="employee-upload-form">
          <div className="input-group" style={{ marginBottom: 12 }}>
            <label className="input-label">Default branch (for rows without branch)</label>
            <select className="input-field" value={branch} onChange={(e) => setBranch(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="employee-upload-actions">
            <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
              Download template
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              Choose CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>

          <button type="button" className="btn btn-primary employee-upload-submit" disabled={uploading || !preview.length} onClick={handleUpload}>
            {uploading ? <div className="spinner" style={{ borderTopColor: '#000' }} /> : `Upload ${preview.length || ''} employees`}
          </button>
        </div>

        <div className="employee-upload-preview">
          {preview.length > 0 ? (
            <>
              <p className="employee-upload-preview-label">
                Preview ({preview.length} rows) → {branch}
              </p>
              <div className="employee-upload-preview-list">
                {preview.slice(0, 30).map((row, i) => (
                  <div key={i} className="employee-upload-preview-row">
                    <strong>{row.name}</strong>
                    <span>{row.phone}</span>
                    <span className="employee-upload-preview-branch">{row.branch || branch}</span>
                  </div>
                ))}
                {preview.length > 30 && (
                  <p className="employee-upload-preview-more">+{preview.length - 30} more</p>
                )}
              </div>
            </>
          ) : (
            <div className="employee-upload-empty">
              <p>Choose a CSV file to preview employees before upload.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
