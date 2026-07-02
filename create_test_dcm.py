import pydicom, pydicom.uid
from pydicom.dataset import FileDataset
import datetime
import numpy as np

ds = FileDataset('test.dcm', {}, file_meta=pydicom.Dataset(), preamble=b'\x00'*128)
ds.file_meta.TransferSyntaxUID = pydicom.uid.ExplicitVRLittleEndian
ds.file_meta.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.6.1'
ds.file_meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
ds.PatientName = 'Teste^Paciente'
ds.PatientID = 'PAC001'
ds.StudyDate = datetime.datetime.now().strftime('%Y%m%d')
ds.Modality = 'US'
ds.StudyInstanceUID = pydicom.uid.generate_uid()
ds.SeriesInstanceUID = pydicom.uid.generate_uid()
ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
ds.SOPClassUID = ds.file_meta.MediaStorageSOPClassUID
ds.Rows, ds.Columns = 256, 256
ds.SamplesPerPixel = 1
ds.BitsAllocated = 8
ds.BitsStored = 8
ds.HighBit = 7
ds.PixelRepresentation = 0
ds.PhotometricInterpretation = 'MONOCHROME2'
ds.PixelData = np.zeros((256*256), dtype=np.uint8).tobytes()
ds.is_implicit_VR = False
ds.is_little_endian = True
pydicom.dcmwrite('test.dcm', ds)
print('test.dcm criado com sucesso!')
