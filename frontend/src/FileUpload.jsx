import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "./components/ui/button"
import { Upload } from "lucide-react"
import FileUploadImage from './assets/FileUploadImage.svg'
import UploadSVG from './assets/upload'

export function FileUpload({ onFileUpload, onSelectFromS3 }) {
  const [isDragActive, setIsDragActive] = useState(false)

  const onDrop = useCallback(
    (acceptedFiles) => {
      onFileUpload(acceptedFiles)
      setIsDragActive(false)
    },
    [onFileUpload],
  )

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".log", ".txt"],
      "application/json": [".json"],
    },
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
  })

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-6">
        <div className="w-[840px] h-[480px] flex flex-col gap-[24px]">
          <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Upload a log file to start analyzing</h1>
          <p className="text-gray-600">
            Drag and drop your log files here or select them from your computer. Supported formats: .log, .txt, .json.
          </p>
          </div>

          <div
        {...getRootProps()}
        className={`
          flex items-center justify-center h-[400px] border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
          ${
            isDragActive
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
          }
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center space-y-4">
          <UploadSVG />

          <div>
            <p className="text-lg font-medium text-gray-900 mb-1">Drag and drop files here</p>
            <p className="text-gray-500 mb-4">Or</p>
            <div className="flex items-center gap-3 justify-center">
            <Button variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50 bg-transparent">
              Browse Files
            </Button>
            <Button onClick={(e) => { e.stopPropagation(); onSelectFromS3(); }} variant="outline" className="text-green-600 border-green-600 hover:bg-green-50 bg-transparent">
                Select from S3
            </Button>
            </div>
          </div>
        </div>
      </div>
        </div>

        {/* Decorative illustration */}
        <div className=" ml-8">
          <img
            src={FileUploadImage}
            alt="Analysis illustration"
            className="w-[480px] h-[480px] object-contain"
          />
        </div>
        {/* <FileUploadImageSVG /> */}
      </div>

      {/* Upload Area */}
      {/* <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
          ${
            isDragActive
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
          }
        `}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <Upload className="w-6 h-6 text-white" />
          </div>

          <div>
            <p className="text-lg font-medium text-gray-900 mb-1">Drag and drop files here</p>
            <p className="text-gray-500 mb-4">Or</p>
            <Button variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50 bg-transparent">
              Browse Files
            </Button>
          </div>
        </div>
      </div> */}
    </div>
  )
}
